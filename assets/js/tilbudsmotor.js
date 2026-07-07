/* ==========================================================================
   Karltoffel Tilbudsmotor (lead flow) — indlejret sektion.
   Uændret logik fra standalone-demoen, men pakket i en IIFE og scopet til
   sektionens rod (#tilbudsmotor), så intet lækker ud i host-sidens globale DOM.
   ========================================================================== */
(function(){
"use strict";

const ROOT = document.getElementById("tilbudsmotor");
if(!ROOT) return;
const $ = (id) => ROOT.querySelector("#" + id);

/* ============ DATA: priser fra WorkMaker Produkter ============ */
/* De prissatte linjer matcher WorkMaker-CSV (04.07.2026). wm = verbatimt
   produktnavn i WorkMaker-CSV (eneste join-nøgle — kun R0–R3 har Varenr),
   inkl. CSV'ens stavefejl: "Tagrenerens 2-plans hus", "Vindeuspudsning
   Indvendig pr glas", "Ukrudt bekæmpelse på belægningsarealer".
   wm = null ⇒ findes endnu ikke i WorkMaker; opret som 0-kr placeholder
   (mønster: "Soignering af bede = 0 kr."): robot, husgarage, stub,
   drivhus, fliserens, sne.
   alge → CSV "Algebehandling af tag"; algeflis → CSV "Algebehandling af
   belægning". beskaering er prissat fra CSV "Beskæring Små træer /
   Frugttræer" (500 kr). pris:null = "Indeholdt" (pakke:true) eller
   "Pris ved besøg" (pakke:false). */
/*PRICING-START*/
const PRODUCTS = [
  /* ---- Villapakken (standard) ---- */
  {id:"vinduer",  navn:"Vinduespudsning udvendig",       enhed:"glas",       pris:15.30, note:"Udvendige ruder",                 qty:14,  freq:8,  fmax:12, on:true,  pakke:true, kat:"pakke", wm:"Vinduespudsning udvendig pr glas"},
  {id:"haek",     navn:"Hækklipning",                    enhed:"m hæk",      pris:27.50, note:"1 side, under 220 cm",            qty:65,  freq:1,  fmax:3,  on:true,  pakke:true, kat:"pakke", wm:"Hækklipning 1 side pr meter Under 220 cm"},
  {id:"green",    navn:"Greenkeeper græspleje",          enhed:"m² plæne",   pris:2.30,  note:"Gødning og pleje af plænen",      qty:450, freq:3,  fmax:6,  on:true,  pakke:true, kat:"pakke", wm:"Greenkeeper græspleje"},
  {id:"alge",     navn:"Algebehandling af tag",          enhed:"m² tag",     pris:4.20,  note:"Mos og alger, beregnet på skråt tagareal", qty:120, freq:1, fmax:2, on:true, pakke:true, kat:"pakke", wm:"Algebehandling af tag"},
  {id:"tagrender",navn:"Tagrenderens",                   enhed:"m tagrende", pris:18.00, note:"Stueplan / 1-plans hus",          qty:24,  freq:1,  fmax:2,  on:true,  pakke:true, kat:"pakke", wm:"Tagrenderens Stueplan / 1-plans hus"},
  {id:"robot",    navn:"Robotplæneklipper service",      enhed:"",           pris:null,  note:"Indeholdt i pakken",              qty:1,   freq:1,  fmax:4,  on:true,  pakke:true, kat:"pakke", wm:null},
  {id:"husgarage",navn:"Vask af hus/garage ned",         enhed:"",           pris:null,  note:"Indeholdt i pakken",              qty:1,   freq:1,  fmax:2,  on:true,  pakke:true, kat:"pakke", wm:null},
  {id:"service",  navn:"Servicering af vinduer og døre", enhed:"",           pris:null,  note:"Indeholdt i pakken",              qty:1,   freq:1,  fmax:2,  on:true,  pakke:true, kat:"pakke", wm:"Service af vinduer og døre"},

  /* ---- Tilvalg: "Vi tilbyder også" (off som standard, gruppe = kat) ---- */
  {id:"ukrudt",    navn:"Ukrudtsbekæmpelse på belægning",         enhed:"m² fliser", pris:1.50,   note:"Vi holder fugerne rene",  qty:60,  freq:1,  fmax:8,  on:false, pakke:false, kat:"groen",   wm:"Ukrudt bekæmpelse på belægningsarealer"},
  {id:"graes",     navn:"Græsslåning",                            enhed:"m² plæne",  pris:1.60,   note:"Klip i sæsonen",          qty:450, freq:1,  fmax:26, on:false, pakke:false, kat:"groen",   wm:"Græsslåning"},
  {id:"beskaering",navn:"Beskæring af buske, træer og planter",   enhed:"træer",     pris:500.00, note:"Små træer/frugttræer — større træer efter besøg", qty:3, freq:1, fmax:2, on:false, pakke:false, kat:"groen", prisEnh:"træ", wm:"Beskæring Små træer / Frugttræer"},
  {id:"soignering",navn:"Soignering af bede",                     enhed:"",          pris:null,   note:"Pris ved besøg",          qty:1,   freq:1,  fmax:12, on:false, pakke:false, kat:"groen",   wm:"Soignering af bede"},
  {id:"stub",      navn:"Stubfræsning",                           enhed:"",          pris:null,   note:"Pris ved besøg",          qty:1,   freq:1,  fmax:1,  on:false, pakke:false, kat:"groen",   wm:null},
  {id:"vinduerind",navn:"Vinduesvask indvendigt",                 enhed:"glas",      pris:19.87,  note:"Indvendige ruder",        qty:14,  freq:1,  fmax:6,  on:false, pakke:false, kat:"vinduer", wm:"Vindeuspudsning Indvendig pr glas"},
  {id:"ovenlys",   navn:"Ovenlysvinduesvask",                     enhed:"stk",       pris:25.00,  note:"Pr. ovenlysvindue",       qty:2,   freq:1,  fmax:4,  on:false, pakke:false, kat:"vinduer", wm:"Ovenlys vinduesvask pr stk"},
  {id:"solcelle",  navn:"Solcellevask",                           enhed:"paneler",   pris:25.00,  note:"Pr. solcellepanel",       qty:0,   freq:1,  fmax:4,  on:false, pakke:false, kat:"vinduer", prisEnh:"panel", wm:"Solcellevask pr solcelle"},
  {id:"drivhus",   navn:"Drivhusvask",                            enhed:"",          pris:null,   note:"Pris ved besøg",          qty:1,   freq:1,  fmax:2,  on:false, pakke:false, kat:"vinduer", wm:null},
  {id:"algeflis",  navn:"Algebehandling af belægning",            enhed:"m² fliser", pris:3.30,   note:"Alger på fliser, terrasse og indkørsel", qty:60, freq:1, fmax:2, on:false, pakke:false, kat:"tag", wm:"Algebehandling af belægning"},
  {id:"fliserens", navn:"Fliserens",                              enhed:"",          pris:null,   note:"Dybderens med maskine — pris ved besøg", qty:1, freq:1, fmax:2, on:false, pakke:false, kat:"tag", wm:null},
  {id:"sedum",     navn:"Gødning af Sedumtag",                    enhed:"m² tag",    pris:21.00,  note:"Pr. m² sedumtag",         qty:0,   freq:1,  fmax:2,  on:false, pakke:false, kat:"tag",     wm:"Gødning af sedumtag"},
  {id:"haveaffald",navn:"Haveaffald (genbrugsafgift)",           enhed:"gang",      pris:600.00, note:"Pr. bortskaffelse",       qty:1,   freq:1,  fmax:6,  on:false, pakke:false, kat:"affald",  wm:"Genbrugsafgift"},
  {id:"sammenriv", navn:"Sammenrivning & bortskaffelse af affald",enhed:"m² plæne",  pris:3.00,   note:"Åbne arealer / plæne",    qty:450, freq:1,  fmax:4,  on:false, pakke:false, kat:"affald",  wm:"Opsamling af løvfald til efteråret Åbne arealer / Græsplæne"},
  {id:"sne",       navn:"Snerydning og saltning",                 enhed:"",          pris:null,   note:"Pris ved besøg",          qty:1,   freq:1,  fmax:20, on:false, pakke:false, kat:"vinter",  wm:null}
];
/* Uberørt kopi til at nulstille pakken når en ny adresse vælges. */
const DEFAULTS = PRODUCTS.map(function(p){ return Object.assign({}, p); });

function beregn(products){
  var aar = 0, count = 0, visits = 0;
  for (var i=0;i<products.length;i++){
    var p = products[i];
    if(!p.on) continue;
    count += 1;                                   /* uprisede ("indeholdt") tæller også med */
    if(p.freq > visits) visits = p.freq;          /* ydelser bundtes på samme besøg */
    if(p.pris != null && p.qty > 0) aar += p.pris * p.qty * p.freq;
  }
  return { aar: aar, md: aar/12, snit: visits>0 ? aar/visits : 0, count: count, visits: visits };
}

function linjeMd(p){ return (p.pris == null || !p.qty) ? 0 : (p.pris * p.qty * p.freq) / 12; }
/*PRICING-END*/

const DKK0 = new Intl.NumberFormat("da-DK",{maximumFractionDigits:0});
const DKK2 = new Intl.NumberFormat("da-DK",{minimumFractionDigits:2,maximumFractionDigits:2});
function kr(n){ return DKK0.format(Math.round(n)) + " kr"; }

/* ============ STATE ============ */
const state = {
  adresse: "",
  kundetype: null,   /* "privat" | "erhverv" — vælges på step 2 */
  ejendom: { type:"Villa, 1 fam.", grund:"827 m²", opfoert:"2007", haek:"65 m" }
};

/* ============ ADRESSEOPSLAG: Adressevælgeren (DAWAs officielle afløser) ============ */
const ADR_API = "https://adressevaelger.dk/husnumre/soeg?token=adressevaelger123&maksimum=6&tekst=";
const DEMO_ADR = ["Sundvej 8, 8700 Horsens","Strandkærvej 30, 8700 Horsens","Bygholm Parkvej 1, 8700 Horsens"];
let adrTimer = null;

const adrInput = $("adr-input"), adrList = $("adr-list"), adrNote = $("adr-note");

adrInput.addEventListener("input", ()=>{
  const q = adrInput.value.trim();
  clearTimeout(adrTimer);
  if(q.length < 3){ lukListe(); return; }
  adrTimer = setTimeout(()=>soegAdresse(q), 250);
});

/* Prøver altid live-API'et; fejler kun for netop den forespørgsel (ingen
   permanent låsning til demo-adresser). */
function soegAdresse(q){
  fetch(ADR_API + encodeURIComponent(q))
    .then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(data => {
      adrNote.classList.remove("show");
      const fund = (data && data.fund) ? data.fund : [];
      const hits = fund.filter(f => f.type === "husnummer").map(f => f.titel);
      if(hits.length){ visListe(hits, false); }
      else if(fund.length){ visListe(fund.slice(0,5).map(f => f.titel), true); }
      else { visListe([], true); }
    })
    .catch(()=>{ adrNote.classList.add("show"); visDemoListe(); });
}

function visListe(items, erHint){
  adrList.innerHTML = "";
  items.forEach(t => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t; b.setAttribute("role","option");
    b.addEventListener("click", ()=> erHint ? fortsaet(t) : vaelgAdresse(t));
    adrList.appendChild(b);
  });
  if(erHint && items.length){
    const h = document.createElement("div");
    h.className = "hint"; h.textContent = "Skriv husnummer med for at ramme din adresse præcist.";
    adrList.appendChild(h);
  }
  if(!items.length){
    const h = document.createElement("div");
    h.className = "hint"; h.textContent = "Ingen match endnu. Skriv lidt mere af adressen.";
    adrList.appendChild(h);
  }
  adrList.classList.add("open");
}

function visDemoListe(){ visListe(DEMO_ADR, false); }
function fortsaet(t){ adrInput.value = t + " "; adrInput.focus(); soegAdresse(adrInput.value.trim()); }
function lukListe(){ adrList.classList.remove("open"); adrList.innerHTML = ""; }

document.addEventListener("click",(e)=>{ if(!e.target.closest(".adr-wrap")) lukListe(); });

/* ============ FLOW ============ */
const DIG_MSGS = ["Graver din matrikel frem...","Måler grunden op...","Kigger på taget fra oven...","Tæller hækmeter...","Regner på det..."];

/* "Nej, prøv igen" cykler gennem skråfotoets 4 optageretninger, så kunden kan
   genkende sin ejendom fra en anden vinkel, før vi sender dem tilbage til
   adressefeltet. Ejendommens data (og dermed prisen) afhænger ikke af fotoet. */
const VERIFY_DIRS = ["north", "east", "south", "west"];
let verifyDir = 0;
const btnNej = $("btn-nej");
const verifyHint = document.createElement("p");
verifyHint.id = "sf-angle-hint";
verifyHint.className = "sf-angle-hint";
verifyHint.setAttribute("role", "status");
verifyHint.setAttribute("aria-live", "polite");
(function(){ const vb = ROOT.querySelector("#step-verify .verify-btns"); if(vb) vb.insertAdjacentElement("afterend", verifyHint); })();
function setVerifyHint(t){ verifyHint.textContent = t || ""; verifyHint.style.display = t ? "block" : "none"; }
setVerifyHint("");

function renderSkraafoto(dir){
  if(window.KARLTOFFEL && window.KARLTOFFEL.skraafotoRender){
    window.KARLTOFFEL.skraafotoRender(state.adresse, dir);
  }
}

/* Auto-mål (nDSM): forudfyld mængderne fra matrikel + bygninger + DHM. */
function applyMeasurements(m){
  if(!m) return;
  state.maal = m;
  const m2 = (v)=> DKK0.format(v) + " m²";
  if(m.grundAreal) state.ejendom.grund = m2(m.grundAreal);
  if(m.haekLangde) state.ejendom.haek = DKK0.format(m.haekLangde) + " m";
  /* Forudfyld kun mængder kunden ikke selv har rettet (touched). */
  const put = (id,v)=>{ if(v>0){ const p = PRODUCTS.find(x=>x.id===id); if(p && !p.touched) p.qty = v; } };
  /* Plænefaktor: haven (grund − bygninger) rummer også indkørsel, terrasse,
     bede og stier. I danske parcelhushaver udgør plænen typisk 60–75 % af
     det åbne areal — vi bruger 70 % som rundt standardtal, afrundet til 10 m². */
  const PLAENE_FAKTOR = 0.70;
  const plaeneAreal = m.haveAreal > 0 ? Math.max(10, Math.round(m.haveAreal * PLAENE_FAKTOR / 10) * 10) : 0;
  put("graes", plaeneAreal); put("green", plaeneAreal); put("sammenriv", plaeneAreal);
  put("haek", m.haekLangde); put("tagrender", m.tagrendeLangde);
  put("alge", m.tagArealSkraat || m.tagAreal);           /* skråt tagareal hvor muligt */
  /* Træantal kan ikke måles — skøn ~1 træ/busk pr. 150 m² have, clamp 2–8. */
  if(m.haveAreal) put("beskaering", Math.min(8, Math.max(2, Math.round(m.haveAreal / 150))));
  /* Højde-baserede pris-tiers ud fra målingen (skifter også WorkMaker-produkt, wm). */
  const haek = PRODUCTS.find(x=>x.id==="haek");
  if(haek && m.haekHojde != null){
    if(m.haekHojde > 2.2){ haek.pris = 38.50; haek.note = "1 side, over 220 cm"; haek.wm = "Hækklipning 1 side pr meter Over 220 cm"; }
    else { haek.pris = 27.50; haek.note = "1 side, under 220 cm"; haek.wm = "Hækklipning 1 side pr meter Under 220 cm"; }
  }
  const tr = PRODUCTS.find(x=>x.id==="tagrender");
  if(tr && m.rygHojde != null){
    if(m.rygHojde > 5){ tr.pris = 28.00; tr.note = "2-plans hus"; tr.wm = "Tagrenerens 2-plans hus"; }
    else { tr.pris = 18.00; tr.note = "Stueplan / 1-plans hus"; tr.wm = "Tagrenderens Stueplan / 1-plans hus"; }
  }
  /* Genrender løsnings-trinnet, så "Pris pr. gang" afspejler de auto-målte mængder. */
  const active = ROOT.querySelector(".step.active");
  if(active && active.id === "step-losning") renderTop();
}

let measureReq = 0;
function resetProducts(){
  PRODUCTS.forEach(function(p,i){ Object.assign(p, DEFAULTS[i]); p.touched = false; });
  state.maal = null;
}

function vaelgAdresse(titel){
  state.adresse = titel;
  lukListe();
  adrInput.value = titel;
  resetProducts();                       /* ny adresse → nulstil pakke + mængder */
  verifyDir = 0; setVerifyHint("");
  if(btnNej) btnNej.textContent = "Nej, prøv igen";
  /* Hent skråfoto parallelt med grave-animationen (fejler stille → SVG-fallback). */
  renderSkraafoto(VERIFY_DIRS[0]);
  /* Auto-mål i baggrunden → forudfylder beregneren. Stale-guard: kun nyeste svar bruges. */
  const req = ++measureReq;
  if(window.KARLTOFFEL && window.KARLTOFFEL.measureProperty){
    window.KARLTOFFEL.measureProperty(titel).then(function(m){ if(req === measureReq) applyMeasurements(m); });
  }
  /* Videre til privat/erhverv-valget; gravningen kører først ved "Videre" derfra
     (skråfoto + auto-mål er allerede sat i gang i baggrunden ovenfor). */
  visStep("step-kundetype");
}

function koerGravning(done){
  const dig = $("dig"), msg = $("dig-msg"), fill = $("dig-fill");
  $("dig-adr").textContent = state.adresse;
  const reduceret = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduceret){ done(); return; }
  ROOT.classList.add("digging");   /* min-height-garanti: overlayet skal have plads på korte trin */
  dig.classList.add("on");
  let i = 0;
  msg.textContent = DIG_MSGS[0]; fill.style.width = "12%";
  const t = setInterval(()=>{
    i++;
    if(i < DIG_MSGS.length){
      msg.textContent = DIG_MSGS[i];
      fill.style.width = (12 + i*22) + "%";
    } else {
      clearInterval(t);
      fill.style.width = "100%";
      setTimeout(()=>{ dig.classList.remove("on"); ROOT.classList.remove("digging"); done(); }, 350);
    }
  }, 620);
}

/* Cta-baren er position:fixed, men en ancestor stacking context gør at den
   maler BAG sidens senere sektioner. Skjul den, når tilbudsmotoren er
   scrollet ud af viewporten. */
(function(){
  const bar = $("cta-bar");
  if(bar && "IntersectionObserver" in window){
    new IntersectionObserver(function(es){
      /* Batches kan indeholde flere entries — den NYESTE afgør synligheden. */
      bar.classList.toggle("off", !es[es.length - 1].isIntersecting);
    }, { threshold: 0 }).observe(ROOT);
  }
})();

const STEP_ORDER = ["step-adresse","step-kundetype","step-verify","step-losning","step-kontakt"];

/* skipScroll: ved stille gendannelse (persistens) må siden ikke hoppe til
   sektionen eller stjæle fokus — kunden er måske landet øverst på forsiden. */
function visStep(id, skipScroll){
  ROOT.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  $("cta-bar").classList.toggle("on", id === "step-losning");
  if(!skipScroll) ROOT.scrollIntoView({ block:"start", behavior:"auto" });
  if(id === "step-verify") $("verify-adr").textContent = state.adresse;
  if(id === "step-losning") renderTop();
  if(id === "step-kontakt") renderRecap();
  /* Fremdrift: "Trin N af 5" + dots (skjules på tak-trinnet). */
  const prog = $("tm-progress");
  if(prog){
    const idx = STEP_ORDER.indexOf(id);
    prog.classList.toggle("done", idx === -1);
    if(idx > -1){
      $("tm-progress-txt").textContent = "Trin " + (idx+1) + " af " + STEP_ORDER.length;
      const dots = $("tm-progress-dots").children;
      for(let i=0;i<dots.length;i++) dots[i].classList.toggle("on", i <= idx);
    }
  }
  if(!skipScroll){
    const h = $(id).querySelector("h1,h2");   /* flyt fokus til trinnets overskrift (a11y) */
    if(h){ h.setAttribute("tabindex","-1"); h.focus({ preventScroll:true }); }
  }
  gemState(id);
}

/* ============ PERSISTENS: flowet overlever refresh (mobil!) ============ */
/* sessionStorage (ikke localStorage): dør med fanen, ingen cookie-samtykke-
   problematik. 1 times udløb. Fejler stille i private-mode. */
const PERSIST_KEY = "tm-state-v1";
function gemState(stepId){
  try {
    if(!state.adresse) return;
    const prod = {};
    PRODUCTS.forEach(p => { prod[p.id] = { on: p.on, qty: p.qty, freq: p.freq, touched: !!p.touched }; });
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify({
      t: Date.now(), adresse: state.adresse, kundetype: state.kundetype, step: stepId, prod
    }));
  } catch(e){ /* private mode / kvote — persistens er best-effort */ }
}
function rydState(){ try { sessionStorage.removeItem(PERSIST_KEY); } catch(e){} }

/* Pris-recap i commitment-øjeblikket: kunden skal kunne se pakken, mens de
   udfylder kontaktfelterne. */
function renderRecap(){
  const el = $("k-recap"); if(!el) return;
  const r = beregn(PRODUCTS);
  el.innerHTML = r.count
    ? "Din pakke: <b>" + kr(r.snit) + " pr. besøg</b> · " + r.count + " services · " + r.visits + " besøg om året — vi bekræfter tallene, når vi ringer."
    : "Ingen services valgt endnu — vi sammensætter løsningen med dig i telefonen.";
}

/* ============ KUNDETYPE (privat/erhverv) ============ */
const ktPrivat = $("kt-privat"), ktErhverv = $("kt-erhverv"),
      ktVidere = $("kt-videre"), ktNote = $("kt-note");
function vaelgKundetype(t){
  state.kundetype = t;
  ktPrivat.classList.toggle("selected", t === "privat");
  ktErhverv.classList.toggle("selected", t === "erhverv");
  ktPrivat.setAttribute("aria-checked", t === "privat" ? "true" : "false");
  ktErhverv.setAttribute("aria-checked", t === "erhverv" ? "true" : "false");
  ktNote.classList.toggle("show", t === "erhverv");
  ktVidere.disabled = false;
}
/* Kortklik vælger OG fortsætter (ét klik i stedet for to). Kort pause så
   valget når at blive synligt; "Videre" står tilbage som tastatur-fallback.
   Race-guards: "Tilbage" i pause-vinduet annullerer timeren, og ktFortsaet
   kører kun mens kundetype-trinnet faktisk er aktivt (dækker også
   prefers-reduced-motion, hvor graveanimationen springes over). */
let ktGaar = false, ktTimer = null;
function ktFortsaet(){
  if(ktGaar) return;
  const aktiv = ROOT.querySelector(".step.active");
  if(!aktiv || aktiv.id !== "step-kundetype") return;
  ktGaar = true;
  koerGravning(()=>{ ktGaar = false; visStep("step-verify"); });
}
function ktKlik(t){ vaelgKundetype(t); if(!ktGaar){ clearTimeout(ktTimer); ktTimer = setTimeout(ktFortsaet, 180); } }
ktPrivat.addEventListener("click", ()=> ktKlik("privat"));
ktErhverv.addEventListener("click", ()=> ktKlik("erhverv"));
ktVidere.addEventListener("click", ()=>{ if(state.kundetype) ktFortsaet(); });
$("kt-tilbage").addEventListener("click", ()=>{ clearTimeout(ktTimer); visStep("step-adresse"); });

/* ============ VIDERE/TILBAGE-NAVIGATION ============ */
/* Step 1: "Videre" kræver en adresse. Er der tekst i feltet, men intet valg
   fra listen, bruger vi det indtastede som adresse (API'et kan være nede). */
$("adr-videre").addEventListener("click", ()=>{
  const q = adrInput.value.trim();
  if(state.adresse && q === state.adresse){ visStep("step-kundetype"); return; }
  if(q.length >= 3){ vaelgAdresse(q); return; }
  adrInput.focus();
});
$("vf-tilbage").addEventListener("click", ()=> visStep("step-kundetype"));
$("ls-tilbage").addEventListener("click", ()=> visStep("step-verify"));
$("ls-videre").addEventListener("click", ()=> visStep("step-kontakt"));
/* "Skift adresse" på løsnings-trinnet: start flowet forfra på adresse-trinnet.
   resetProducts() kører automatisk, når en ny adresse vælges (vaelgAdresse). */
$("ls-skift").addEventListener("click", ()=>{
  adrInput.value = "";
  lukListe();
  visStep("step-adresse");
  adrInput.focus();
});

$("btn-ja").addEventListener("click", ()=> visStep("step-losning"));
btnNej.addEventListener("click", ()=>{
  verifyDir++;
  if(verifyDir < VERIFY_DIRS.length){
    /* Vis samme ejendom fra næste vinkel — bliv på verify-trinnet. */
    renderSkraafoto(VERIFY_DIRS[verifyDir]);
    setVerifyHint("Vi viser din ejendom fra en anden vinkel ("+(verifyDir+1)+" af "+VERIFY_DIRS.length+"). Genkender du den nu?");
    btnNej.textContent = (verifyDir === VERIFY_DIRS.length-1) ? "Nej, skriv adressen igen" : "Nej, vis en anden vinkel";
  } else {
    /* Alle vinkler prøvet → tilbage til adressefeltet. */
    verifyDir = 0; setVerifyHint(""); btnNej.textContent = "Nej, prøv igen";
    adrInput.value = ""; visStep("step-adresse"); adrInput.focus();
  }
});
$("btn-kontakt").addEventListener("click", ()=>{ $("cta-bar").classList.remove("on"); visStep("step-kontakt"); });
$("btn-tilbage").addEventListener("click", ()=> visStep("step-losning"));

$("btn-send").addEventListener("click", ()=>{
  const navn = $("k-navn").value.trim(), mail = $("k-mail").value.trim(), tlf = $("k-tlf").value.trim();
  /* Telefon er obligatorisk — hele løftet er et opkald. E-mail er valgfri,
     men skal ligne en e-mail, hvis den er udfyldt. */
  if(!navn || tlf.replace(/\D/g,"").length < 8){ sendFejl("Udfyld navn og telefonnummer, så vi kan ringe dig op."); return; }
  if(mail && mail.indexOf("@") < 1){ sendFejl("Tjek lige e-mailen — den ser ikke rigtig ud."); return; }
  $("k-err").classList.remove("show");

  const r = beregn(PRODUCTS);
  const valgt = PRODUCTS.filter(p=>p.on);
  const ktLabel = state.kundetype === "erhverv" ? " · Erhverv" : (state.kundetype === "privat" ? " · Privat" : "");

  /* Lead-payload til CRM'et: kontaktinfo + valgte services (med WorkMaker-
     nøgle under overgangen) + estimat + kundetype. Sendes via sitets relay
     (/api/lead) — secret'en bor på serveren, aldrig i browseren. */
  const payload = {
    name: navn, email: mail, phone: tlf,
    message: $("k-note").value.trim().slice(0, 2000),   /* server-cap er 2000 — klip lokalt så relayets 9 KB-grænse aldrig rammes */
    address: state.adresse,
    kundetype: state.kundetype,
    source: "tilbudsmotor",
    services: valgt.map(p=>({ id:p.id, navn:p.navn, wm:p.wm, qty:p.qty, enhed:p.enhed, freq:p.freq, pris:p.pris })),
    estimat: { md: Math.round(r.md), snit: Math.round(r.snit), aar: Math.round(r.aar), visits: r.visits, count: r.count }
  };

  const btnSend = $("btn-send");
  btnSend.disabled = true;
  const btnTekst = btnSend.textContent;
  btnSend.textContent = "Sender...";

  fetch("/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => { if(!res.ok) throw new Error("HTTP " + res.status); return res.json().catch(()=>({})); })   /* 2xx med u-parsbar body: leadet ER oprettet — vis tak-siden */
  .then((data)=>{
    /* CRM'et returnerer call:"booked 2026-07-06T15:15:00" når opkalds-slottet
       er lagt i kalenderen — vis det konkrete tidspunkt til kunden. */
    const ring = $("tak-ring");
    if(ring){
      const t = ringTekst(data && data.call);
      ring.textContent = t;
      ring.classList.toggle("show", !!t);
    }
    const opsum = $("tak-opsum");
    if(!valgt.length){
      opsum.innerHTML = "<b>" + esc(state.adresse) + ktLabel + "</b><br>Du har ikke valgt nogen services endnu — vi ringer og sammensætter løsningen med dig.";
    } else {
      const linjer = valgt.map(p=>{
        const suffix = (p.pris == null) ? (p.pakke ? " (indeholdt)" : " (pris ved besøg)")
                     : (!p.qty ? " (angiv antal)" : " (" + p.freq + "x/år)");
        return esc(p.navn) + suffix;
      }).join(", ");
      opsum.innerHTML =
        "<b>" + esc(state.adresse) + ktLabel + "</b><br>" +
        "Valgt: " + linjer + "<br>" +
        "Estimeret: <b>" + kr(r.snit) + " pr. besøg</b> ved " + r.visits + " besøg om året.";
    }
    rydState();   /* leadet er sendt — intet at gendanne længere */
    visStep("step-tak");
  })
  .catch(()=>{
    sendFejl("Vi kunne ikke sende din forespørgsel lige nu. Prøv igen om et øjeblik — eller ring til os.");
  })
  .finally(()=>{ btnSend.disabled = false; btnSend.textContent = btnTekst; });
});

function sendFejl(t){ const e = $("k-err"); e.textContent = t; e.classList.add("show"); }

/* "booked 2026-07-06T15:15:00" → "Vi ringer til dig i dag ca. kl. 15:15."
   Slottet er dansk vægur-tid; kunderne sidder i praksis i samme tidszone. */
function ringTekst(call){
  const m = /^booked (\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(call || "");
  if(!m) return "";
  const y = +m[1], mo = +m[2], d = +m[3], klok = m[4] + ":" + m[5];
  const nu = new Date(), imorgen = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + 1);
  const erDag = (dt)=> dt.getFullYear() === y && dt.getMonth() + 1 === mo && dt.getDate() === d;
  const DAGE = ["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
  const dag = erDag(nu) ? "i dag" : erDag(imorgen) ? "i morgen" : "på " + DAGE[new Date(y, mo - 1, d).getDay()];
  return "Vi ringer til dig " + dag + " ca. kl. " + klok + ".";
}

function esc(s){ const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

/* ============ RENDER ============ */
const CAT_ORDER = ["pakke", "groen", "vinduer", "tag", "affald", "vinter"];
const CAT_LABELS = { pakke:"Fra Villapakken", groen:"Grøn have", vinduer:"Vinduer & glas", tag:"Tag & fliser", affald:"Affald", vinter:"Vinter" };
/* id på det felt der lige er flyttet mellem kolonnerne — får et kort "flash" ved gen-render. */
let flashId = null;
function enhKort(p){ return p.enhed ? p.enhed.split(" ")[0] : "enhed"; }
function prisEnh(p){ return p.prisEnh || enhKort(p); }   /* ental til "kr pr. X" */
function focusById(id){ const el = ROOT.querySelector('input[data-pid="' + id + '"]'); if(el) el.focus(); }

function renderTop(){
  $("t-adr").textContent = state.adresse || "Din adresse";
  renderLosning();
}

/* Fuld gen-render: rækker (aktive) + tilvalg (inaktive) + priser. */
function renderLosning(){ renderRows(); renderAddons(); opdater(); }

function knap(tegn, label){
  const b = document.createElement("button");
  b.type = "button"; b.textContent = tegn; b.setAttribute("aria-label", label);
  return b;
}

function renderRows(){
  const wrap = $("rows");
  wrap.innerHTML = "";
  PRODUCTS.filter(p => p.on).forEach(p => {
    const priced = (p.pris != null);
    const incl = (p.pakke && !priced);          /* del af Villapakken → "Indeholdt" */
    const row = document.createElement("div");
    row.className = "row" + (incl ? " row--incl" : "") + (p.id === flashId ? " flash" : "");

    const chk = document.createElement("input");
    chk.type = "checkbox"; chk.checked = true; chk.dataset.pid = p.id;
    chk.id = "chk-" + p.id;
    chk.setAttribute("aria-label", "Fravælg " + p.navn);
    chk.addEventListener("change", ()=>{ p.on = false; flashId = p.id; renderLosning(); flashId = null; });

    /* Titlen er en <label for=checkbox>, så hele navnet toggler rækken. */
    const navn = document.createElement("label");
    navn.className = "navn";
    navn.htmlFor = chk.id;
    navn.textContent = p.navn;

    /* Pris pr. gang — label over tallet (indhold sættes af opdater()). */
    const pw = document.createElement("div");
    pw.className = "pw"; pw.dataset.id = p.id;

    /* Frekvens — "Besøg om året" over stepperen. Gælder ALLE rækker (også de indeholdte). */
    const fw = document.createElement("div");
    fw.className = "fw";
    const flbl = document.createElement("span"); flbl.className = "fw-lbl"; flbl.textContent = "Besøg om året";
    const ctl = document.createElement("div"); ctl.className = "fw-ctl";
    const minus = knap("−", "Færre besøg med " + p.navn);
    const fv = document.createElement("b");
    const plus = knap("+", "Flere besøg med " + p.navn);
    function sync(){ fv.textContent = p.freq; minus.disabled = p.freq <= 1; plus.disabled = p.freq >= p.fmax; }
    minus.addEventListener("click", ()=>{ if(p.freq > 1){ p.freq--; sync(); opdater(); } });
    plus.addEventListener("click", ()=>{ if(p.freq < p.fmax){ p.freq++; sync(); opdater(); } });
    sync();
    ctl.appendChild(minus); ctl.appendChild(fv); ctl.appendChild(plus);
    fw.appendChild(flbl); fw.appendChild(ctl);

    row.appendChild(chk); row.appendChild(navn); row.appendChild(pw); row.appendChild(fw);
    wrap.appendChild(row);
  });
}

/* "Vi tilbyder også" — inaktive services som kompakte chips, grupperet i kategorier. */
function renderAddons(){
  const wrap = $("addons");
  if(!wrap) return;
  wrap.innerHTML = "";
  CAT_ORDER.forEach(katKey => {
    const items = PRODUCTS.filter(p => !p.on && p.kat === katKey);
    if(!items.length) return;
    const grp = document.createElement("div"); grp.className = "addon-cat-grp";
    const lbl = document.createElement("div"); lbl.className = "addon-cat"; lbl.textContent = CAT_LABELS[katKey];
    const list = document.createElement("div"); list.className = "addon-list";
    items.forEach(p => {
      const chip = document.createElement("label"); chip.className = "addon" + (p.id === flashId ? " flash" : "");
      const chk = document.createElement("input");
      chk.type = "checkbox"; chk.checked = false; chk.dataset.pid = p.id;
      chk.setAttribute("aria-label", "Tilvælg " + p.navn);
      chk.addEventListener("change", ()=>{ p.on = true; flashId = p.id; renderLosning(); flashId = null; });
      const txt = document.createElement("span"); txt.className = "addon-navn"; txt.textContent = p.navn;   /* kun navnet — pris + frekvens vises, når den flyttes til venstre */
      const add = document.createElement("span"); add.className = "addon-add"; add.textContent = "+"; add.setAttribute("aria-hidden", "true");
      chip.appendChild(chk); chip.appendChild(txt); chip.appendChild(add);
      list.appendChild(chip);
    });
    grp.appendChild(lbl); grp.appendChild(list); wrap.appendChild(grp);
  });
}

function opdater(){
  PRODUCTS.forEach(p => {
    const el = ROOT.querySelector('.pw[data-id="' + p.id + '"]');
    if(!el) return;
    if(p.pris == null){
      el.innerHTML = '<span class="pw-note">' + (p.pakke ? "Indeholdt i pakken" : "Pris ved besøg") + '</span>';
    } else if(!p.qty){
      el.innerHTML = '<span class="pw-note">Pris efter antal</span>';
    } else {
      el.innerHTML = '<span class="pw-lbl">Pris pr. gang</span><b class="pw-val">' + kr(p.pris * p.qty) + '</b>';
    }
  });
  const r = beregn(PRODUCTS);
  $("cta-pris").textContent = kr(r.snit);
  $("cta-detalje").textContent = "Gennemsnitspris pr. besøg · " + r.count + " services · " + r.visits + " besøg om året";
  gemState("step-losning");   /* hver frekvens-/til-fravalgs-ændring overlever refresh */
}

/* ============ GENDAN (kør sidst — alle handlers er nu på plads) ============ */
(function gendan(){
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem(PERSIST_KEY) || "null"); } catch(e){ return; }
  if(!s || !s.adresse || Date.now() - (s.t || 0) > 3600e3) return;
  if(["step-kundetype","step-verify","step-losning","step-kontakt"].indexOf(s.step) === -1) return;

  state.adresse = s.adresse;
  adrInput.value = s.adresse;
  if(s.kundetype === "privat" || s.kundetype === "erhverv") vaelgKundetype(s.kundetype);
  if(s.prod) PRODUCTS.forEach(p => {
    const d = s.prod[p.id];
    if(d){ p.on = !!d.on; if(typeof d.qty === "number") p.qty = d.qty; if(typeof d.freq === "number") p.freq = d.freq; p.touched = !!d.touched; }
  });
  /* Skråfoto + auto-mål genstartes i baggrunden (stale-guard beskytter
     brugerens gendannede mængder via touched-flaget). */
  renderSkraafoto(VERIFY_DIRS[0]);
  const req = ++measureReq;
  if(window.KARLTOFFEL && window.KARLTOFFEL.measureProperty){
    window.KARLTOFFEL.measureProperty(s.adresse).then(function(m){ if(req === measureReq) applyMeasurements(m); });
  }
  visStep(s.step, true);   /* stille: intet scroll-hop, ingen fokus-tyveri */
})();

})();
