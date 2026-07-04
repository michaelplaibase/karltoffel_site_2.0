/* ==========================================================================
   Karltoffel — Skråfoto (Dataforsyningen STAC API v2).
   --------------------------------------------------------------------------
   Level B: adresse → koordinat (DAWA, både WGS84 og EPSG:25832) → nærmeste
   skråfoto (STAC /search) → terrænhøjde (DHM WCS) → projicér ejendommens
   punkt til pixel (kollinearitet, saul getImageXY) → crop COG'en om huset og
   markér det. Al fejl fanges → falder tilbage til hele rammen, og derefter
   til SVG-placeholderen (#sf-fallback).

   Kræver:
     - window.KARLTOFFEL.skraafoto  (token + endpoints, se tilbudsmotor.config.js)
     - GeoTIFF                      (assets/js/vendor/geotiff.min.js)
   Eksponerer:
     - window.KARLTOFFEL.skraafotoRender(adresse)  → Promise (kaster aldrig)
   ========================================================================== */
(function () {
  "use strict";

  var NS = (window.KARLTOFFEL = window.KARLTOFFEL || {});
  var CFG = NS.skraafoto || {};
  var ROOT = document.getElementById("tilbudsmotor");

  var DIR_DA = { north: "nord", south: "syd", east: "øst", west: "vest", nadir: "lodret" };
  var YEAR_RE = /(\d{4})/;

  function el(id) { return ROOT ? ROOT.querySelector("#" + id) : null; }
  function tokenParam() { return "token=" + encodeURIComponent(CFG.token || ""); }

  /* ---- 1) Adresse → koordinat (WGS84 til STAC-søgning, EPSG:25832 til projektion) ---- */
  function geocode(adresse) {
    var base = CFG.dawaBase + "/adgangsadresser?per_side=1&struktur=mini&q=" +
      encodeURIComponent(adresse);
    var asJson = function (r) { if (!r.ok) throw new Error("DAWA " + r.status); return r.json(); };
    return Promise.all([
      fetch(base).then(asJson),                     // x/y = lon/lat (WGS84)
      fetch(base + "&srid=25832").then(asJson)       // x/y = easting/northing (EPSG:25832)
    ]).then(function (res) {
      var a = res[0] && res[0][0], b = res[1] && res[1][0];
      if (!a || !b) throw new Error("Ingen adresse-match");
      return { id: a.id, lon: a.x, lat: a.y, X: b.x, Y: b.y, betegnelse: a.betegnelse || adresse };
    });
  }

  /* ---- 1b) Adresse-id → matrikel-polygon (grund) i EPSG:25832 ----
     Adgangspunktet kan ligge på en fælles-/nabobygning; matriklen viser den
     faktiske grund. Returnerer null hvis noget fejler → falder tilbage til punkt. */
  function getParcel(id) {
    if (!id) return Promise.resolve(null);
    return fetch(CFG.dawaBase + "/adgangsadresser/" + id)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (adr) {
        var j = adr.jordstykke || {};
        var ejerlav = j.ejerlav && j.ejerlav.kode, matr = j.matrikelnr;
        if (!ejerlav || !matr) return null;
        return fetch(CFG.dawaBase + "/jordstykker/" + ejerlav + "/" + matr + "?format=geojson&srid=25832")
          .then(function (r) { if (!r.ok) throw 0; return r.json(); })
          .then(function (gj) {
            var f0 = gj.features && gj.features[0];
            var g = gj.geometry || (f0 && f0.geometry);
            if (!g) return null;
            var props = gj.properties || (f0 && f0.properties) || {};
            var ring = g.type === "MultiPolygon" ? g.coordinates[0][0] : g.coordinates[0];
            var cx = 0, cy = 0;
            ring.forEach(function (p) { cx += p[0]; cy += p[1]; });
            return { ring: ring, centroid: [cx / ring.length, cy / ring.length], matrikelnr: matr,
                     registreretareal: props.registreretareal };
          });
      })
      .catch(function () { return null; });
  }

  /* ---- 1c) Adresse-id → bygningens fodaftryk + visueltcenter (EPSG:25832) ----
     Åben DAWA-kilde (GeoDanmark). Mere robust end matriklen ved lange indkørsler
     og lejligheder, hvor adgangspunkt/matrikel-centroide kan ligge skævt.
     Vælger den største bygning (hovedhuset) hvis flere returneres. Null ved fejl. */
  function ringArea(ring) {
    var a = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  }
  function getBuilding(id) {
    if (!id) return Promise.resolve(null);
    return fetch(CFG.dawaBase + "/bygninger?adgangsadresseid=" + id + "&format=geojson&srid=25832")
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (gj) {
        var feats = (gj && gj.features) || [];
        if (!feats.length) return null;
        var best = null, bestA = -1, bestRing = null;
        feats.forEach(function (f) {
          var g = f.geometry; if (!g) return;
          var ring = g.type === "MultiPolygon" ? g.coordinates[0][0] : g.coordinates[0];
          var a = ringArea(ring);
          if (a > bestA) { bestA = a; best = f; bestRing = ring; }
        });
        if (!bestRing) return null;
        var pr = best.properties || {};
        var cx = pr.visueltcenter_x, cy = pr.visueltcenter_y;
        if (cx == null || cy == null) {
          cx = 0; cy = 0; bestRing.forEach(function (p) { cx += p[0]; cy += p[1]; });
          cx /= bestRing.length; cy /= bestRing.length;
        }
        return { ring: bestRing, center: [cx, cy], area: bestA };
      })
      .catch(function () { return null; });
  }

  /* ==================================================================
     MÅLING (nDSM): auto-mål af ejendommen fra matrikel + bygninger + DHM.
     Bruger kun endpoints der allerede er bevist live. Alt fejler stille → null.
     ================================================================== */
  function ringPerimeter(ring) {
    var p = 0;
    for (var i = 1; i < ring.length; i++) {
      var dx = ring[i][0] - ring[i - 1][0], dy = ring[i][1] - ring[i - 1][1];
      p += Math.sqrt(dx * dx + dy * dy);
    }
    return p;
  }
  function ringBbox(ring) {
    var xs = ring.map(function (p) { return p[0]; }), ys = ring.map(function (p) { return p[1]; });
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  }
  function pointInPoly(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function pctl(arr, p) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.max(0, Math.min(a.length - 1, Math.round(p * (a.length - 1))))];
  }
  function median(arr) { return pctl(arr, 0.5); }

  /* DHM-dækning (dhm_terraen | dhm_overflade) som float32-gitter over bbox. */
  function fetchGrid(coverage, bbox) {
    var w = Math.max(16, Math.min(300, Math.round((bbox[2] - bbox[0]) / 0.4)));
    var h = Math.max(16, Math.min(300, Math.round((bbox[3] - bbox[1]) / 0.4)));
    var url = CFG.dhmWcsBase + "?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=" + coverage +
      "&CRS=epsg:25832&RESPONSE_CRS=epsg:25832&FORMAT=GTiff&WIDTH=" + w + "&HEIGHT=" + h +
      "&BBOX=" + bbox.join(",") + "&" + tokenParam();
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error("DHM " + r.status); return r.arrayBuffer(); })
      .then(function (buf) { return GeoTIFF.fromArrayBuffer(buf); })
      .then(function (t) { return t.getImage(); })
      .then(function (img) {
        return img.readRasters().then(function (ras) {
          return { data: ras[0], w: img.getWidth(), h: img.getHeight(), bbox: bbox };
        });
      });
  }
  function sampleGrid(g, X, Y) {
    var col = Math.floor((X - g.bbox[0]) / (g.bbox[2] - g.bbox[0]) * g.w);
    var row = Math.floor((g.bbox[3] - Y) / (g.bbox[3] - g.bbox[1]) * g.h); // GeoTIFF: række 0 = nord
    if (col < 0 || col >= g.w || row < 0 || row >= g.h) return NaN;
    return g.data[row * g.w + col];
  }

  /* Alle bygninger på grunden (hovedhus + skure/carporte), filtreret via matrikel-polygon. */
  function getBuildingsOnParcel(centroid, parcelRing) {
    var bb = ringBbox(parcelRing);
    var R = Math.max(30, 0.75 * Math.max(bb[2] - bb[0], bb[3] - bb[1]) + 15);
    var url = CFG.dawaBase + "/bygninger?cirkel=" + Math.round(centroid[0]) + "," + Math.round(centroid[1]) +
      "," + Math.round(R) + "&format=geojson&srid=25832";
    return fetch(url)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (gj) {
        var out = [];
        ((gj && gj.features) || []).forEach(function (f) {
          var g = f.geometry; if (!g) return;
          var ring = g.type === "MultiPolygon" ? g.coordinates[0][0] : g.coordinates[0];
          var pr = f.properties || {};
          var cx = pr.visueltcenter_x, cy = pr.visueltcenter_y;
          if (cx == null) { cx = 0; cy = 0; ring.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= ring.length; cy /= ring.length; }
          if (pointInPoly(cx, cy, parcelRing)) out.push({ ring: ring, area: ringArea(ring), perimeter: ringPerimeter(ring) });
        });
        return out;
      })
      .catch(function () { return []; });
  }

  function measureProperty(adresse) {
    if (!CFG.token || typeof GeoTIFF === "undefined") return Promise.resolve(null);
    return geocode(adresse).then(function (geo) {
      return getParcel(geo.id).then(function (parcel) {
        if (!parcel) return null;
        var pbb = ringBbox(parcel.ring), mg = 6;
        var bbox = [pbb[0] - mg, pbb[1] - mg, pbb[2] + mg, pbb[3] + mg];
        return Promise.all([
          getBuildingsOnParcel(parcel.centroid, parcel.ring),
          fetchGrid("dhm_terraen", bbox).catch(function () { return null; }),
          fetchGrid("dhm_overflade", bbox).catch(function () { return null; })
        ]).then(function (res) {
          var buildings = res[0], dtm = res[1], dsm = res[2];
          var ndsm = function (X, Y) {
            if (!dtm || !dsm) return NaN;
            var a = sampleGrid(dsm, X, Y), b = sampleGrid(dtm, X, Y);
            return (isFinite(a) && isFinite(b)) ? a - b : NaN;
          };
          var grundAreal = parcel.registreretareal || ringArea(parcel.ring);
          var grundOmkreds = ringPerimeter(parcel.ring);
          var bygningsAreal = buildings.reduce(function (s, b) { return s + b.area; }, 0);
          var m = {
            grundAreal: Math.round(grundAreal),
            grundOmkreds: Math.round(grundOmkreds),
            bygningsAreal: Math.round(bygningsAreal),
            haveAreal: Math.max(0, Math.round(grundAreal - bygningsAreal)),
            antalBygninger: buildings.length,
            haekLangde: Math.round(grundOmkreds) // øvre grænse; kunden kan justere
          };
          var main = buildings.slice().sort(function (a, b) { return b.area - a.area; })[0];
          if (main) {
            m.tagAreal = Math.round(main.area);
            m.tagOmkreds = Math.round(main.perimeter);
            m.tagrendeLangde = Math.round(main.perimeter * 0.6); // tagfod ≈ 60% af omkreds (saddeltag)
            if (dtm && dsm && dsm.w === dtm.w && dsm.h === dtm.h) {
              // Højde + hældning fra DSM-gitteret over bygningens fodaftryk.
              var W = dsm.w, Hh = dsm.h, bx0 = dsm.bbox[0], by1 = dsm.bbox[3];
              var csx = (dsm.bbox[2] - dsm.bbox[0]) / W, csy = (dsm.bbox[3] - dsm.bbox[1]) / Hh;
              var bb = ringBbox(main.ring);
              var c0 = Math.max(1, Math.floor((bb[0] - bx0) / csx)), c1 = Math.min(W - 2, Math.ceil((bb[2] - bx0) / csx));
              var r0 = Math.max(1, Math.floor((by1 - bb[3]) / csy)), r1 = Math.min(Hh - 2, Math.ceil((by1 - bb[1]) / csy));
              var heights = [], slopes = [];
              for (var r = r0; r <= r1; r++) {
                for (var c = c0; c <= c1; c++) {
                  var Xc = bx0 + (c + 0.5) * csx, Yc = by1 - (r + 0.5) * csy;
                  if (!pointInPoly(Xc, Yc, main.ring)) continue;
                  var idx = r * W + c, nd = dsm.data[idx] - dtm.data[idx];
                  if (!(nd > 1)) continue; // kun tag (over terræn)
                  heights.push(nd);
                  var dzdx = (dsm.data[idx + 1] - dsm.data[idx - 1]) / (2 * csx);
                  var dzdy = (dsm.data[idx - W] - dsm.data[idx + W]) / (2 * csy);
                  slopes.push(Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI);
                }
              }
              if (heights.length > 5) {
                m.rygHojde = Math.round(pctl(heights, 0.97) * 10) / 10;
                m.tagfodHojde = Math.round(pctl(heights, 0.15) * 10) / 10;
                var pitch = Math.max(0, Math.min(60, median(slopes)));
                m.taghaeldning = Math.round(pitch);
                m.tagArealSkraat = Math.round(main.area / Math.cos(pitch * Math.PI / 180));
              }
            }
          }
          if (dtm && dsm) {
            var hv = [];
            for (var i = 1; i < parcel.ring.length; i++) {
              var ax = parcel.ring[i - 1][0], ay = parcel.ring[i - 1][1];
              var bx = parcel.ring[i][0], by = parcel.ring[i][1];
              var n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2));
              for (var s = 0; s < n; s++) {
                var t = s / n, hh2 = ndsm(ax + (bx - ax) * t, ay + (by - ay) * t);
                if (isFinite(hh2) && hh2 > 0.4 && hh2 < 3.5) hv.push(hh2);
              }
            }
            var hm = median(hv);
            if (hm != null) m.haekHojde = Math.round(hm * 10) / 10;
          }
          return m;
        });
      });
    }).catch(function () { return null; });
  }
  NS.measureProperty = measureProperty;

  /* ---- 2) Koordinat → bedste skråfoto-item via STAC /search (intersects i WGS84) ---- */
  function findItem(lon, lat, direction) {
    var collections = CFG.collections || [];
    var want = direction || CFG.direction || "north";

    function tryCollection(i) {
      if (i >= collections.length) throw new Error("Ingen skråfoto-dækning");
      var body = {
        collections: [collections[i]],
        intersects: { type: "Point", coordinates: [lon, lat] },
        limit: 40
      };
      return fetch(CFG.stacBase + "/search?" + tokenParam(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
        .then(function (r) { if (!r.ok) throw new Error("STAC " + r.status); return r.json(); })
        .then(function (fc) {
          var feats = (fc && fc.features) || [];
          var oblique = feats.filter(function (f) {
            return f.properties && f.properties.direction && f.properties.direction !== "nadir";
          });
          if (!oblique.length) return tryCollection(i + 1);
          var pick = oblique.filter(function (f) { return f.properties.direction === want; })[0] ||
            oblique[0];
          var io = pick.properties["pers:interior_orientation"] || {};
          var dim = io.sensor_array_dimensions || [14144, 10560];
          return {
            id: pick.id,
            collection: collections[i],
            direction: pick.properties.direction,
            href: pick.assets && pick.assets.data && pick.assets.data.href,
            props: pick.properties,
            W: dim[0], H: dim[1]
          };
        });
    }
    return tryCollection(0);
  }

  /* ---- 3) Terrænhøjde Z (m, DVR90) via DHM WCS — falder tilbage til 0 ---- */
  function terrainZ(X, Y) {
    if (typeof GeoTIFF === "undefined" || !CFG.dhmWcsBase) return Promise.resolve(0);
    var d = 3, bbox = [Math.round(X) - d, Math.round(Y) - d, Math.round(X) + d, Math.round(Y) + d].join(",");
    var url = CFG.dhmWcsBase +
      "?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=dhm_terraen" +
      "&CRS=epsg:25832&RESPONSE_CRS=epsg:25832&FORMAT=GTiff&WIDTH=3&HEIGHT=3&BBOX=" + bbox +
      "&" + tokenParam();
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error("DHM " + r.status); return r.arrayBuffer(); })
      .then(function (buf) { return GeoTIFF.fromArrayBuffer(buf); })
      .then(function (t) { return t.getImage(); })
      .then(function (img) { return img.readRasters(); })
      .then(function (rasters) {
        var band = rasters[0], v = band[Math.floor(band.length / 2)];
        return (isFinite(v) && v > -1000 && v < 500) ? v : 0;
      })
      .catch(function () { return 0; });
  }

  /* ---- 4) Verden (X,Y,Z, EPSG:25832) → billed-pixel. Port af Dataforsyningens
             saul getImageXY (kollinearitet via omega/phi/kappa). ---- */
  function rad(deg) { return deg * Math.PI / 180; }
  function getImageXY(props, X, Y, Z) {
    var io = props["pers:interior_orientation"];
    var xx0 = io.principal_point_offset[0], yy0 = io.principal_point_offset[1];
    var ci = io.focal_length, pix = io.pixel_spacing[0];
    var dimXi = io.sensor_array_dimensions[0], dimYi = io.sensor_array_dimensions[1];
    var pc = props["pers:perspective_center"];
    var X0 = pc[0], Y0 = pc[1], Z0 = pc[2];
    var o = rad(props["pers:omega"]), p = rad(props["pers:phi"]), k = rad(props["pers:kappa"]);
    var c = -ci, dimX = -dimXi * pix / 2, dimY = -dimYi * pix / 2;
    var D11 = Math.cos(p) * Math.cos(k), D12 = -Math.cos(p) * Math.sin(k), D13 = Math.sin(p);
    var D21 = Math.cos(o) * Math.sin(k) + Math.sin(o) * Math.sin(p) * Math.cos(k);
    var D22 = Math.cos(o) * Math.cos(k) - Math.sin(o) * Math.sin(p) * Math.sin(k);
    var D23 = -Math.sin(o) * Math.cos(p);
    var D31 = Math.sin(o) * Math.sin(k) - Math.cos(o) * Math.sin(p) * Math.cos(k);
    var D32 = Math.sin(o) * Math.cos(k) + Math.cos(o) * Math.sin(p) * Math.sin(k);
    var D33 = Math.cos(o) * Math.cos(p);
    var den = D13 * (X - X0) + D23 * (Y - Y0) + D33 * (Z - Z0);
    var x_dot = -c * ((D11 * (X - X0) + D21 * (Y - Y0) + D31 * (Z - Z0)) / den);
    var y_dot = -c * ((D12 * (X - X0) + D22 * (Y - Y0) + D32 * (Z - Z0)) / den);
    return [
      Math.round(((x_dot - xx0) + dimX) * (-1) / pix),
      Math.round(((y_dot - yy0) + dimY) * (-1) / pix)
    ];
  }

  /* saul's getImageXY returnerer rækken med BUND-origo (OpenLayers y-op, som
     Dataforsyningens egen viewer bruger). geotiff.js/canvas er TOP-origo, så
     rækken skal spejles: row_raster = H - row_saul. Uden dette lander alt
     spejlet om billedets vandrette midterlinje → forkert hus. */
  function projectRaster(item, X, Y, Z) {
    var p = getImageXY(item.props, X, Y, Z);
    return [p[0], item.H - p[1]];
  }

  /* ---- 5) COG → canvas. Med opts.center croppes et udsnit om huset og der
             tegnes en markør; ellers renderes hele rammen (fallback). ---- */
  function yiq(raster, k, rgba, j) {
    var Y = raster[k], Cb = raster[k + 1] - 128, Cr = raster[k + 2] - 128;
    rgba[j] = Y + 1.402 * Cr;
    rgba[j + 1] = Y - 0.344136 * Cb - 0.714136 * Cr;
    rgba[j + 2] = Y + 1.772 * Cb;
  }

  function drawShape(ctx, pts, W, bold) {
    if (!pts || pts.length < 3) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    if (bold) {                                   // bygningen — fyldt, kraftig gul
      ctx.fillStyle = "rgba(255,248,123,0.15)"; ctx.fill();
      ctx.lineWidth = Math.max(4.5, W * 0.008); ctx.strokeStyle = "rgba(76,55,24,0.85)"; ctx.stroke();
      ctx.lineWidth = Math.max(2.5, W * 0.005); ctx.strokeStyle = "rgba(255,248,123,0.98)"; ctx.stroke();
    } else {                                      // grunden — stiplet, diskret
      ctx.setLineDash([Math.max(7, W * 0.014), Math.max(6, W * 0.011)]);
      ctx.lineWidth = Math.max(2, W * 0.0045); ctx.strokeStyle = "rgba(76,55,24,0.55)"; ctx.stroke();
      ctx.lineWidth = Math.max(1.5, W * 0.003); ctx.strokeStyle = "rgba(255,248,123,0.85)"; ctx.stroke();
    }
    ctx.restore();
  }

  function drawMarker(ctx, x, y, W) {
    var r = Math.max(9, W * 0.014);
    ctx.save();
    ctx.lineWidth = Math.max(2.5, W * 0.004);
    ctx.strokeStyle = "rgba(76,55,24,0.9)";   // mørk kant for kontrast
    ctx.beginPath(); ctx.arc(x, y, r + ctx.lineWidth, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = "rgba(255,248,123,0.98)"; // --gul
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 2, y); ctx.lineTo(x - r * 0.7, y);
    ctx.moveTo(x + r * 0.7, y); ctx.lineTo(x + r * 2, y);
    ctx.moveTo(x, y - r * 2); ctx.lineTo(x, y - r * 0.7);
    ctx.moveTo(x, y + r * 0.7); ctx.lineTo(x, y + r * 2);
    ctx.stroke();
    ctx.restore();
  }

  function renderCOG(href, canvas, opts) {
    if (typeof GeoTIFF === "undefined") return Promise.reject(new Error("geotiff.js mangler"));
    opts = opts || {};
    return GeoTIFF.fromUrl(href).then(function (tiff) {
      return tiff.getImageCount().then(function (count) {
        var reqs = [];
        for (var i = 0; i < count; i++) reqs.push(tiff.getImage(i));
        return Promise.all(reqs).then(function (imgs) {
          var W = imgs[0].getWidth(), H = imgs[0].getHeight();
          var levels = imgs.map(function (im) {
            return { img: im, w: im.getWidth(), dec: W / im.getWidth() };
          }).filter(function (l) { return l.w > 0; });

          // Vindue i fuld-opløsnings-koordinater.
          var win;
          if (opts.frame && opts.frame.length >= 3) {
            // Ram huset/grunden ind med margin.
            var oxs = opts.frame.map(function (p) { return p.col; });
            var oys = opts.frame.map(function (p) { return p.row; });
            var mnx = Math.min.apply(null, oxs), mxx = Math.max.apply(null, oxs);
            var mny = Math.min.apply(null, oys), mxy = Math.max.apply(null, oys);
            var pad = Math.max(mxx - mnx, mxy - mny) * 0.65 + 60;
            win = [mnx - pad, mny - pad, mxx + pad, mxy + pad];
          } else if (opts.center) {
            var half = Math.round((opts.spanPx || 1400) / 2), halfV = Math.round(half * 3 / 4);
            win = [opts.center.col - half, opts.center.row - halfV,
                   opts.center.col + half, opts.center.row + halfV];
          } else {
            win = [0, 0, W, H];
          }
          win[0] = Math.max(0, Math.min(W - 2, win[0])); win[2] = Math.max(win[0] + 1, Math.min(W, win[2]));
          win[1] = Math.max(0, Math.min(H - 2, win[1])); win[3] = Math.max(win[1] + 1, Math.min(H, win[3]));
          var spanW = win[2] - win[0];

          // Vælg groveste overview der stadig giver ≥ targetRead px (sparer båndbredde uden at sløre).
          var targetRead = Math.min(1600, Math.max(720, (opts.canvasW || 640) * 1.4));
          var lvl = levels[0];
          for (var li = 0; li < levels.length; li++) {
            if (spanW / levels[li].dec >= targetRead && levels[li].dec > lvl.dec) lvl = levels[li];
          }
          var dec = lvl.dec;
          var ow = [Math.floor(win[0] / dec), Math.floor(win[1] / dec),
                    Math.ceil(win[2] / dec), Math.ceil(win[3] / dec)];
          var ycbcr = lvl.img.fileDirectory && lvl.img.fileDirectory.PhotometricInterpretation === 6;

          return lvl.img.readRasters({ interleave: true, samples: [0, 1, 2], window: ow }).then(function (raster) {
            var bw = ow[2] - ow[0], bh = ow[3] - ow[1], n = bw * bh;
            var rgba = new Uint8ClampedArray(n * 4);
            for (var i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
              if (ycbcr) { yiq(raster, k, rgba, j); }
              else { rgba[j] = raster[k]; rgba[j + 1] = raster[k + 1]; rgba[j + 2] = raster[k + 2]; }
              rgba[j + 3] = 255;
            }
            var offc = document.createElement("canvas");
            offc.width = bw; offc.height = bh;
            offc.getContext("2d").putImageData(new ImageData(rgba, bw, bh), 0, 0);

            var outW = opts.canvasW || 1024, outH = Math.round(outW * bh / bw);
            canvas.width = outW; canvas.height = outH;
            var ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            ctx.drawImage(offc, 0, 0, outW, outH);

            var toCanvas = function (col, row) {
              return { x: (col / dec - ow[0]) / bw * outW, y: (row / dec - ow[1]) / bh * outH };
            };
            var proj = function (poly) { return poly.map(function (p) { return toCanvas(p.col, p.row); }); };
            var hasB = opts.building && opts.building.length >= 3;
            var hasP = opts.parcel && opts.parcel.length >= 3;
            if (hasP) drawShape(ctx, proj(opts.parcel), outW, !hasB); // grund: stiplet hvis bygning vises, ellers kraftig
            if (hasB) drawShape(ctx, proj(opts.building), outW, true);
            if (!hasB && !hasP && opts.center) {
              var m = toCanvas(opts.center.col, opts.center.row);
              if (m.x > 0 && m.x < outW && m.y > 0 && m.y < outH) drawMarker(ctx, m.x, m.y, outW);
            }
            return { bw: bw, bh: bh };
          });
        });
      });
    });
  }

  /* ---- Orkestrering: kaldes fra tilbudsmotor.js ved adressevalg ---- */
  var lastReq = 0;
  function skraafotoRender(adresse, direction) {
    var card = ROOT && ROOT.querySelector(".foto-card");
    var canvas = el("sf-canvas");
    var badge = el("sf-badge");
    var note = el("sf-note");
    if (!card || !canvas || !CFG.token) return Promise.resolve(false);

    var req = ++lastReq;
    function stale() { return req !== lastReq; }

    card.classList.remove("has-photo");
    card.classList.add("sf-loading");
    if (badge) badge.textContent = "Henter skråfoto …";

    var outW = Math.min(1024, Math.round((card.clientWidth || 640) * (window.devicePixelRatio || 1)));
    var geo, item, parcel, building;

    return geocode(adresse)
      .then(function (g) {
        if (stale()) throw new Error("stale");
        geo = g;
        return Promise.all([findItem(g.lon, g.lat, direction), getParcel(g.id), getBuilding(g.id)]);
      })
      .then(function (res) {
        if (stale()) throw new Error("stale");
        item = res[0]; parcel = res[1]; building = res[2];
        if (!item.href) throw new Error("Item uden billed-URL");
        // Terrænhøjde ved bygningen (ellers grund-centroide, ellers adgangspunkt).
        var zc = building ? building.center : (parcel ? parcel.centroid : [geo.X, geo.Y]);
        return terrainZ(zc[0], zc[1]);
      })
      .then(function (Z) {
        if (stale()) throw new Error("stale");
        var inBounds = function (px) { return px[0] > 0 && px[0] < item.W && px[1] > 0 && px[1] < item.H; };
        var projPoly = function (ring) {
          return ring.map(function (c) { var px = projectRaster(item, c[0], c[1], Z); return { col: px[0], row: px[1] }; });
        };
        var buildingPx = null, parcelPx = null, center = null, frame = null;
        try {
          // Foretrukket: bygningens fodaftryk (tæt indramning, kraftigt omrids).
          if (building) {
            var bc = projectRaster(item, building.center[0], building.center[1], Z);
            if (inBounds(bc)) { buildingPx = projPoly(building.ring); center = { col: bc[0], row: bc[1] }; frame = buildingPx; }
          }
          // Grunden tegnes altid (stiplet hvis bygning vises, ellers som hovedomrids).
          if (parcel) {
            parcelPx = projPoly(parcel.ring);
            if (!center) {
              var pc = projectRaster(item, parcel.centroid[0], parcel.centroid[1], Z);
              if (inBounds(pc)) { center = { col: pc[0], row: pc[1] }; }
            }
            if (!frame) frame = parcelPx;
          }
          // Sidste udvej: adgangspunkt som markør.
          if (!frame && !center) {
            var apx = projectRaster(item, geo.X, geo.Y, Z);
            if (inBounds(apx)) center = { col: apx[0], row: apx[1] };
          }
        } catch (e) { /* projektion fejlede → hele rammen */ }
        return renderCOG(item.href, canvas, {
          frame: frame, building: buildingPx, parcel: parcelPx, center: center,
          spanPx: CFG.cropSpanPx || 1400, canvasW: outW
        }).then(function () { return { building: buildingPx, parcel: parcelPx, center: center }; });
      })
      .then(function (r) {
        if (stale()) return false;
        card.classList.remove("sf-loading");
        card.classList.add("has-photo");
        var year = (item.collection.match(YEAR_RE) || [])[1] || "";
        var dir = DIR_DA[item.direction] || item.direction;
        var matr = parcel && parcel.matrikelnr ? " (matr. " + parcel.matrikelnr + ")" : "";
        if (badge) badge.textContent = "Skråfoto " + year + " · set mod " + dir;
        if (note) {
          if (r.building) {
            note.textContent = "Rigtigt skråfoto fra Dataforsyningen (" + item.collection + "). Din bygning er markeret, grunden" + matr + " stiplet.";
          } else if (r.parcel) {
            note.textContent = "Rigtigt skråfoto fra Dataforsyningen (" + item.collection + "). Din grund" + matr + " er markeret.";
          } else if (r.center) {
            note.textContent = "Rigtigt skråfoto fra Dataforsyningen (" + item.collection + "). Adressen er markeret.";
          } else {
            note.textContent = "Rigtigt skråfoto fra Dataforsyningen (" + item.collection + ").";
          }
        }
        return true;
      })
      .catch(function (err) {
        if (stale()) return false;
        card.classList.remove("sf-loading", "has-photo");
        if (badge) badge.textContent = "Skråfoto demo";
        if (note) note.textContent = "Kunne ikke hente skråfoto lige nu — viser demo. (" + (err && err.message || err) + ")";
        if (window.console) console.warn("[skraafoto]", err);
        return false;
      });
  }

  NS.skraafotoRender = skraafotoRender;
})();
