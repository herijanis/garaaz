(() => {
  const API = "https://garaaz.garaaz-worker.workers.dev";
  const $ = id => document.getElementById(id);
  const STATUS = {vaja:"Vaja teha",tellitud:"Tellitud",tehtud:"Tehtud",vale:"Vale osa"};
  let key = null, cars = [], logs = [], selId = null, editId = null, who = null;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch(e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch(e) {} },
  };
  selId = store.get("garaaz.sel");
  who = store.get("garaaz.who");
  if(who === "Herijan" || who === "Isa"){ who = who === "Herijan" ? "Richard" : "Janno"; store.set("garaaz.who", who); }

  // võti tuleb lingist (#k=...) ja jääb telefoni meelde
  const m = location.hash.match(/k=([A-Za-z0-9_-]+)/);
  if(m){ key = m[1]; store.set("garaaz.key", key); history.replaceState(null, "", location.pathname); }
  else key = store.get("garaaz.key");
  // teavituste töötaja (sw.js) vajab võtit, localStoraget ta ei näe
  if(key && "caches" in window) caches.open("garaaz-key").then(c => c.put("/key", new Response(key))).catch(() => {});

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmtDate = iso => { if(!iso) return ""; const [y,m,d] = String(iso).split("-"); return d ? `${d}.${m}.${y}` : iso; };
  const today = () => new Date().toISOString().slice(0,10);
  const car = () => cars.find(c => c.id === selId);
  const banner = msg => { $("banner").textContent = msg; $("banner").hidden = !msg; };
  const imgUrl = id => `${API}/api/img/${encodeURIComponent(id)}?k=${encodeURIComponent(key||"")}`;
  const num = s => parseFloat(String(s ?? "").replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;

  async function api(path, method = "GET", body){
    const r = await fetch(API + path, {method, headers:{"Content-Type":"application/json","X-Key":key||""}, body: body ? JSON.stringify(body) : undefined});
    const data = await r.json().catch(() => ({}));
    if(!r.ok) throw Object.assign(new Error(data.error || "Viga"), {status:r.status});
    return data;
  }
  async function refresh(){
    try{
      const d = await api("/api/data");
      cars = Object.values(d.cars || {});
      logs = Object.values(d.log || {});
      if(!cars.some(c => c.id === selId)) selId = cars[0]?.id || null;
      banner(""); renderAll();
    }catch(e){
      $("plates").innerHTML = "";
      banner(e.status === 401 ? "See link on vale või vana. Küsi õige link." : "Andmed ei laadinud. Kontrolli internetti ja laadi leht uuesti.");
    }
  }
  function renderAll(){ renderWho(); renderPlates(); renderCar(); renderDue(); renderLog(); }

  // ---------- kes ma olen ----------
  function renderWho(){
    $("whoCard").hidden = $("whoBg").hidden = !!who || !key;
    $("whoName").textContent = who || "";
    $("whoAvatar").textContent = (who || "?").slice(0,1).toUpperCase();
    $("whoChange").hidden = !who;
  }
  $("whoCard").querySelectorAll("[data-who]").forEach(b => b.onclick = () => {
    if(b.dataset.who === "?"){ $("whoOther").hidden = false; $("whoInput").focus(); return; }
    who = b.dataset.who; store.set("garaaz.who", who); renderWho();
  });
  $("whoOther").onsubmit = e => { e.preventDefault(); const v = $("whoInput").value.trim(); if(v){ who = v; store.set("garaaz.who", v); renderWho(); } };
  $("whoChange").onclick = () => { who = null; renderWho(); };

  // ---------- autod ----------
  function renderPlates(){
    const nav = $("plates");
    nav.innerHTML = cars.map(c =>
      `<button class="plate" type="button" data-id="${esc(c.id)}" aria-pressed="${c.id===selId}"><span class="eu">EST</span><span class="num">${esc(c.plate)}</span></button>`
    ).join("") + `<button class="addcar" type="button" id="addCarBtn">+ auto</button>`;
    if(!cars.length) nav.insertAdjacentHTML("afterbegin", `<span class="empty">Autosid veel pole. Lisa esimene.&nbsp;</span>`);
    nav.querySelectorAll(".plate").forEach(b => b.onclick = () => select(b.dataset.id));
    $("addCarBtn").onclick = () => openCarForm(null);
  }

  function renderCar(){
    const c = car();
    ["carPanel","askPanel","logPanel","dueCard","hero"].forEach(id => $(id).hidden = !c);
    if(!c) return;
    $("carName").textContent = `${c.make||""} ${c.model||""}`.trim() || "Auto andmed";
    $("heroMake").textContent = c.make || "";
    $("heroName").textContent = c.model || c.plate;
    $("carLine").textContent = [c.motor, c.engine && `mootor ${c.engine}`, c.gear].filter(Boolean).join(" · ");
    $("statKm").textContent = c.km ? Number(c.km).toLocaleString("et-EE") : "–";
    const insp = String(c.inspection || "").match(/(\d{1,2})\.(\d{4})|(\d{4})-(\d{1,2})/);
    $("statInsp").textContent = insp ? (insp[1] ? `${insp[1].padStart(2,"0")}.${insp[2]}` : `${insp[4].padStart(2,"0")}.${insp[3]}`) : "–";
    const spec = [["Numbrimärk",c.plate,1],["VIN",c.vin,1],["Mootorikood",c.engine,1],["Mootor",c.motor],["Esmane reg.",c.first],
      ["Läbisõit",c.km?Number(c.km).toLocaleString("et-EE")+" km":""],["Käigukast",c.gear],["Kere",c.body],["Kelle oma",c.owner]];
    $("carSpec").innerHTML = spec.filter(s => s[1]).map(([k,v,m]) => `<div><dt>${k}</dt><dd${m?' class="mono"':''}>${esc(v)}</dd></div>`).join("");
    $("carNotes").textContent = c.notes || "";
    $("carNotes").hidden = !c.notes;
    const vin = $("lnkVin");
    vin.hidden = !c.vin;
    if(c.vin) vin.href = "https://partsouq.com/en/search/all?q=" + encodeURIComponent(c.vin);
  }

  function select(id){
    selId = id; store.set("garaaz.sel", id);
    clearAnswer(); $("photoOut").hidden = true;
    renderAll();
  }

  async function write(fn){
    try { const r = await fn(); await refresh(); return r || true; }
    catch(e){ banner(e.status === 401 ? "See link on vale või vana. Küsi õige link." : "Salvestamine ei õnnestunud. Proovi uuesti."); return false; }
  }

  // ---------- tähtajad ----------
  function renderDue(){
    const c = car(); if(!c) return;
    const all = (window.dueList ? window.dueList({[c.id]:c}, new Date()) : []);
    const ul = $("dueList");
    if(!all.length){
      ul.innerHTML = `<li class="due-empty">Tähtaegu pole veel sisestatud. Vajuta "Muuda tähtaegu" ja pane ülevaatus, kindlustus ja viimane õlivahetus.</li>`;
    } else {
      ul.innerHTML = all.map(d => `<li class="due ${d.level}"><span class="dot" aria-hidden="true"></span><span>${esc(d.text)}</span></li>`).join("");
    }
    $("pushBtn").hidden = !("serviceWorker" in navigator && "PushManager" in window) || store.get("garaaz.push") === "on";
    const first = all.find(d => d.level !== "ok");
    $("nextDue").hidden = !first;
    if(first){ $("nextDue").className = "next " + first.level; $("nextDueText").textContent = first.text; }
  }
  $("editDue").onclick = () => openCarForm(car(), true);
  $("nextDue").onclick = () => showTab("hooldus");
  $("kmBtn").onclick = () => { $("kmForm").hidden = !$("kmForm").hidden; $("kmInput").value = car()?.km || ""; $("kmInput").focus(); };
  $("kmForm").onsubmit = async e => {
    e.preventDefault();
    const c = car(); const km = $("kmInput").value.replace(/\D/g, "");
    if(!c || !km) return;
    if(await write(() => api("/api/car/"+encodeURIComponent(c.id), "POST", {car:{km, kmDate:today()}}))) $("kmForm").hidden = true;
  };

  // ---------- teavitused ----------
  $("pushBtn").onclick = async () => {
    const b = $("pushBtn");
    try{
      if(/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone){
        banner("iPhone'is: vajuta Jaga → \"Lisa avakuvale\", ava äpp sealt ja vajuta siis uuesti \"Luba teavitused\".");
        return;
      }
      b.disabled = true; b.textContent = "Luban…";
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if(perm !== "granted"){ banner("Teavitused jäid keelatuks. Luba need telefoni seadetes ja proovi uuesti."); return; }
      const { key: vapid } = await api("/api/vapid");
      const pad = "=".repeat((4 - vapid.length % 4) % 4);
      const raw = Uint8Array.from(atob((vapid + pad).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      await api("/api/push/subscribe", "POST", { sub: sub.toJSON(), who });
      await api("/api/push/test", "POST", { endpoint: sub.endpoint });
      store.set("garaaz.push", "on");
      b.hidden = true;
    }catch(e){
      banner("Teavitusi ei õnnestunud lubada sellel telefonil.");
    }finally{ b.disabled = false; b.textContent = "Luba teavitused telefoni"; }
  };
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // ---------- tööd ----------
  function renderLog(){
    const ul = $("log");
    const mine = logs.filter(l => l.carId === selId).sort((a,b) => {
      const open = s => s === "vaja" || s === "tellitud" ? 0 : 1;
      return open(a.status) - open(b.status) || String(b.date||"").localeCompare(String(a.date||""));
    });
    const year = String(new Date().getFullYear());
    const spent = mine.filter(l => l.status === "tehtud" && String(l.date||"").startsWith(year)).reduce((s,l) => s + num(l.price), 0);
    const allYear = logs.filter(l => l.status === "tehtud" && String(l.date||"").startsWith(year)).reduce((s,l) => s + num(l.price), 0);
    const eur = v => v.toFixed(2).replace(".", ",") + " €";
    $("costLine").innerHTML = `<span class="muted">Kulud ${year}</span><span class="big">${eur(spent)}</span>` +
      (cars.length > 1 ? `<span class="muted" style="flex-basis:100%">Kõik autod kokku: <b>${eur(allYear)}</b></span>` : "");
    $("statYear").textContent = year;
    $("statCost").textContent = Math.round(spent).toLocaleString("et-EE") + " €";
    if(!mine.length){ ul.innerHTML = `<li><p class="empty">Siin pole veel midagi. Vajuta "+ Lisa töö".</p></li>`; return; }
    ul.innerHTML = mine.map(l => {
      const meta = [fmtDate(l.date), l.part && `<span class="mono">${esc(l.part)}</span>`, l.price && `${esc(l.price)} €`, l.shop && esc(l.shop), l.by && `lisas ${esc(l.by)}`].filter(Boolean).join(" · ");
      const link = /^https:\/\//.test(l.note||"") ? l.note : "";
      const photos = (l.photos||[]).map(p => `<a href="${esc(imgUrl(p))}" target="_blank" rel="noopener"><img src="${esc(imgUrl(p))}" alt="Pilt" loading="lazy"></a>`).join("");
      const open = l.status === "vaja" || l.status === "tellitud";
      return `<li class="item s-${esc(l.status)}" data-id="${esc(l.id)}">
          <span class="title">${esc(l.title)}</span>
          ${meta?`<span class="meta">${meta}</span>`:""}
          ${link?`<a class="meta" href="${esc(link)}" target="_blank" rel="noopener">Ava poes ↗</a>`:l.note?`<span class="meta">${esc(l.note)}</span>`:""}
          ${photos?`<div class="thumbs">${photos}</div>`:""}
          <div class="acts">
            <select aria-label="Olek">${Object.entries(STATUS).map(([k,v]) => `<option value="${k}"${k===l.status?" selected":""}>${v}</option>`).join("")}</select>
            <label class="pic"><span>📷 Pilt</span><input type="file" accept="image/*" hidden></label>
            ${open?`<label class="watch"><input type="checkbox"${l.watch?" checked":""}> Jälgi hinda</label>`:""}
            <button type="button" class="del">Kustuta</button>
          </div></li>`;
    }).join("");
    ul.querySelectorAll("li[data-id]").forEach(li => {
      const id = li.dataset.id;
      li.querySelector("select").onchange = e => {
        const patch = {status:e.target.value};
        if(e.target.value === "tehtud") patch.date = today();
        write(() => api("/api/log/"+id, "PATCH", {patch}));
      };
      const w = li.querySelector(".watch input");
      if(w) w.onchange = () => write(() => api("/api/log/"+id, "PATCH", {patch:{watch:w.checked}}));
      li.querySelector(".pic input").onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        const lab = li.querySelector(".pic span"); lab.textContent = "Laen üles…";
        try{
          const image = await shrink(f, 1280);
          const { id: pid } = await api("/api/img", "POST", {image});
          const l = logs.find(x => x.id === id);
          await write(() => api("/api/log/"+id, "PATCH", {patch:{photos:[...(l?.photos||[]), pid]}}));
        }catch(err){ banner("Pildi üleslaadimine ei õnnestunud."); lab.textContent = "📷 Pilt"; }
      };
      const del = li.querySelector(".del");
      del.onclick = () => {
        if(del.dataset.armed){ write(() => api("/api/log/"+id, "DELETE")); return; }
        del.dataset.armed = "1"; del.textContent = "Kindel? Kustuta"; del.classList.add("danger");
        setTimeout(() => { if(del.isConnected){ delete del.dataset.armed; del.textContent = "Kustuta"; del.classList.remove("danger"); } }, 4000);
      };
    });
  }

  // ---------- auto vorm ----------
  const CF = {plate:"cPlate",owner:"cOwner",make:"cMake",model:"cModel",vin:"cVin",engine:"cEngine",motor:"cMotor",first:"cFirst",km:"cKm",gear:"cGear",body:"cBody",notes:"cNotes",
    inspection:"cInspection",insurance:"cInsurance",oilKm:"cOilKm",oilDate:"cOilDate",oilEveryKm:"cOilEvery"};
  function openCarForm(c, dueOnly){
    editId = c ? c.id : null;
    $("carFormTitle").textContent = dueOnly ? "Tähtajad" : c ? "Muuda auto andmeid" : "Lisa auto";
    for(const [k,id] of Object.entries(CF)) $(id).value = c ? (c[k] ?? "") : "";
    $("carFormPanel").classList.toggle("due-only", !!dueOnly);
    $("carFormPanel").hidden = $("sheetBg").hidden = false;
    $("carFormPanel").scrollTop = 0;
  }
  $("editCar").onclick = () => openCarForm(car());
  const closeSheet = () => { $("carFormPanel").hidden = $("sheetBg").hidden = true; };
  $("cancelCar").onclick = closeSheet;
  $("sheetBg").onclick = closeSheet;
  $("carForm").onsubmit = async e => {
    e.preventDefault();
    const data = {};
    for(const [k,id] of Object.entries(CF)) data[k] = $(id).value.trim();
    data.plate = data.plate.toUpperCase().replace(/\s+/g,"");
    data.vin = data.vin.toUpperCase();
    data.km = data.km.replace(/\D/g, ""); data.oilKm = data.oilKm.replace(/\D/g, ""); data.oilEveryKm = data.oilEveryKm.replace(/\D/g, "");
    const id = editId || data.plate.replace(/[^A-Z0-9]/g,"");
    if(!id){ banner("Numbrimärk on puudu."); return; }
    selId = id; store.set("garaaz.sel", id);
    if(await write(() => api("/api/car/"+encodeURIComponent(id), "POST", {car:data}))) closeSheet();
  };

  // ---------- töö vorm ----------
  $("lDate").value = today();
  $("logForm").onsubmit = async e => {
    e.preventDefault();
    if(!selId) return;
    const entry = {carId:selId, title:$("lTitle").value.trim(), status:$("lStatus").value, date:$("lDate").value,
      part:$("lPart").value.trim(), price:$("lPrice").value.trim(), shop:$("lShop").value.trim(), note:$("lNote").value.trim(), by:who||""};
    if(!entry.title) return;
    if(await write(() => api("/api/log", "POST", {entry}))){
      ["lTitle","lPart","lPrice","lShop","lNote"].forEach(id => $(id).value = "");
      $("logForm").hidden = true;
    }
  };
  $("addLogBtn").onclick = () => { $("logForm").hidden = false; $("lTitle").focus(); };
  $("cancelLog").onclick = () => { $("logForm").hidden = true; };

  // ---------- otsi osa ----------
  const G = s => "https://www.google.com/search?q=" + encodeURIComponent(s);
  const SHOPS = [
    ["Aeromotors", q => "https://aeromotors.ee/otsi?s=" + encodeURIComponent(q)],
    ["Automaailm", q => "https://automaailm.ee/catalogsearch/result/?q=" + encodeURIComponent(q)],
    ["Dynamic Motors", q => "https://dynamicmotors.ee/tooted/?search_query=" + encodeURIComponent(q)],
    ["Intercars24", q => G(`site:intercars24.ee ${q}`)],
    ["Autokaubad24", q => G(`site:autokaubad24.ee ${q}`)],
    ["Autodoc", q => "https://www.autodoc.ee/search?keyword=" + encodeURIComponent(q)],
  ];
  const USED = [
    ["auto24", (q,b) => G(`site:auto24.ee ${b} ${q}`)],
    ["osta.ee", (q,b) => G(`site:osta.ee ${b} ${q}`)],
  ];
  const TYPE = {originaal:"originaal", analoog:"analoog", kasutatud:"kasutatud", kulu:"kuluosa"};
  const safeUrl = u => /^https:\/\//i.test(String(u||"")) ? String(u) : "";
  function shopLinks(code, base, used){
    const list = used ? USED : SHOPS;
    return list.map(([n,f]) => `<a href="${esc(f(code, base))}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join("");
  }
  function clearAnswer(){ $("answer").hidden = true; $("opts").innerHTML = ""; $("checkBox").hidden = true; }
  let lastOpts = [];
  function renderAnswer(r, c){
    const base = `${c.make||""} ${c.model||""}`.trim();
    $("answer").textContent = r.vastus || ""; $("answer").hidden = !r.vastus;
    const opts = lastOpts = Array.isArray(r.variandid) ? r.variandid.slice(0,4) : [];
    $("opts").innerHTML = opts.map((o, i) => {
      const code = String(o.kood || "").trim();
      const q = code || `${base} ${o.nimi||""}`.trim();
      const used = o.tuup === "kasutatud";
      const link = safeUrl(o.link);
      const badges = [i === 0 && link ? `<span class="badge best">Soovitan</span>` : "", TYPE[o.tuup] ? `<span class="badge">${TYPE[o.tuup]}</span>` : "", o.pood ? `<span>${esc(o.pood)}</span>` : ""].join("");
      return `<div class="opt${i === 0 && link ? " best" : ""}">
        <div class="opt-top"><span class="opt-name">${esc(o.nimi||"")}</span>${o.hind?`<span class="opt-price">${esc(o.hind)}</span>`:""}</div>
        <div class="opt-meta">${badges}${code?`<span class="opt-code">${esc(code)}</span>`:""}</div>
        ${o.miks?`<p class="opt-why">${esc(o.miks)}</p>`:""}
        <div class="opt-acts">
          ${link?`<a class="buy" href="${esc(link)}" target="_blank" rel="noopener">Ava poes →</a>`:""}
          <button type="button" class="save" data-i="${i}">+ Tööde alla</button>
        </div>
        <details class="more"><summary>Otsi teistest poodidest</summary><div class="shops">${shopLinks(q, base, used)}</div></details>
      </div>`;
    }).join("");
    $("opts").querySelectorAll(".save").forEach(b => b.onclick = async () => {
      const o = lastOpts[+b.dataset.i]; if(!o || b.disabled) return;
      b.disabled = true; b.textContent = "Salvestan…";
      const entry = {carId:c.id, title:o.nimi || $("askInput").value.trim(), status:"vaja", date:today(),
        part:String(o.kood||""), price:String(o.hind||"").replace(/\s*€/,""), shop:o.pood||"", note:safeUrl(o.link), by:who||""};
      if(await write(() => api("/api/log", "POST", {entry}))){ b.textContent = "✓ Lisatud"; b.classList.add("done"); }
      else { b.disabled = false; b.textContent = "+ Tööde alla"; }
    });
    const chk = Array.isArray(r.kontrolli) ? r.kontrolli.slice(0,3) : [];
    $("checkList").innerHTML = chk.map(t => `<li>${esc(t)}</li>`).join("");
    $("checkBox").hidden = !chk.length;
  }
  function fallback(c, q, msg){
    renderAnswer({vastus: msg, variandid:[{nimi:q, kood:"", tuup:""}], kontrolli:["Vaata vana osa pealt tähist või OEM-numbrit ja otsi selle järgi."]}, c);
  }
  let busy = false;
  function waiting(on, steps){
    const st = $("askStatus");
    clearInterval(waiting.t);
    st.hidden = !on; $("askBtn").disabled = on; $("photoBtn").classList.toggle("off", on);
    if(!on) return;
    const t0 = Date.now();
    const tick = () => { const sec = Math.round((Date.now()-t0)/1000); $("askStatusText").textContent = `${steps[Math.min(steps.length-1, Math.floor(sec/15))]} (${sec} s)`; };
    tick(); waiting.t = setInterval(tick, 500);
  }
  async function search(q){
    const c = car(); if(!c || !q || busy) return;
    busy = true; clearAnswer();
    waiting(true, ["Leian sinu autole õige osa…", "Vaatan Eesti poode läbi…", "Võrdlen hindu…", "Kohe valmis…"]);
    try{
      const r = await api("/api/ask", "POST", {carId:c.id, q});
      if(r && typeof r === "object") renderAnswer(r, c); else fallback(c, q, "Vastus tuli segane. Otsi poodidest otse:");
    }catch(err){
      fallback(c, q, (err.message && err.status !== 500 ? err.message + " " : "Vastust ei tulnud. ") + "Otsi poodidest otse:");
    }finally{ waiting(false); busy = false; }
  }
  $("askForm").onsubmit = e => { e.preventDefault(); search($("askInput").value.trim()); };
  $("chips").querySelectorAll(".chip").forEach(ch => ch.onclick = () => {
    if(ch.dataset.fill){ $("askInput").value = ch.dataset.fill; $("askInput").focus(); return; }
    $("askInput").value = ch.textContent; search(ch.textContent);
  });

  // ---------- pildid ----------
  function shrink(file, max){
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("pilt")); };
      img.src = url;
    });
  }
  const LEVEL = {punane:"red", kollane:"yellow", info:"ok"};
  $("photoInput").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    const c = car(); if(!f || busy) return;
    busy = true; clearAnswer(); $("photoOut").hidden = true;
    waiting(true, ["Vaatan pilti…", "Loen, mis seal on…", "Kohe valmis…"]);
    let image;
    try{
      image = await shrink(f, 1280);
      const r = await api("/api/photo", "POST", {carId:c?.id, image});
      waiting(false); busy = false;
      showPhoto(r, image, c);
    }catch(err){
      waiting(false); busy = false;
      banner(err.message && err.status && err.status !== 500 ? err.message : "Pildi lugemine ei õnnestunud. Proovi uuesti, parema valgusega.");
    }
  };
  function showPhoto(r, image, c){
    const out = $("photoOut");
    const lvl = LEVEL[r.tase] || "";
    let html = `<img class="shot" src="${image}" alt="Sinu pilt">`;
    html += r.vastus ? `<p class="lead">${esc(r.vastus)}</p>` : "";
    if(r.soita) html += `<p class="drive ${lvl}">${esc(r.soita)}</p>`;
    if(Array.isArray(r.kontrolli) && r.kontrolli.length) html += `<div class="checkbox"><strong>Kontrolli</strong><ul class="check">${r.kontrolli.slice(0,3).map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
    const acts = [];
    if(r.liik === "osa" && r.kood) html += `<p class="readcode">Pildilt loetud: <b class="mono">${esc(r.kood)}</b></p>`;
    if((r.liik === "osa" || r.liik === "kahjustus") && (r.otsi || r.kood)) acts.push(`<button type="button" class="big-btn" data-act="search">Otsi see osa poodidest</button>`);
    if(r.liik === "dokument" && r.auto) acts.push(`<button type="button" class="big-btn" data-act="car">Lisa / uuenda auto nende andmetega</button>`);
    if(r.liik === "tsekk" && Array.isArray(r.read) && r.read.length){
      html += `<ul class="rows">${r.read.map(x => `<li><span>${esc(x.nimi)}${x.kood?` <span class="mono">${esc(x.kood)}</span>`:""}</span><b>${esc(x.hind)} €</b></li>`).join("")}</ul>`;
      if(c) acts.push(`<button type="button" class="big-btn" data-act="receipt">Lisa tehtud töödena (${esc(c.plate)})</button>`);
    }
    if(c) acts.push(`<button type="button" class="btn2" data-act="keep">Salvesta pilt tööde alla</button>`);
    html += `<div class="col">${acts.join("")}</div>`;
    out.innerHTML = html; out.hidden = false;
    out.scrollIntoView({behavior:"smooth", block:"start"});
    out.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      if(act === "search"){ const q = [r.otsi || r.nimi, r.kood].filter(Boolean).join(" "); $("askInput").value = q; out.hidden = true; search(q); }
      if(act === "car"){
        const a = r.auto; const id = String(a.plate||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
        const existing = cars.find(x => x.id === id);
        const merged = {...(existing||{}), ...Object.fromEntries(Object.entries(a).filter(([,v]) => v))};
        openCarForm(merged);
        editId = existing ? existing.id : null;
      }
      if(act === "receipt"){
        b.disabled = true;
        const entries = r.read.map(x => ({carId:c.id, title:x.nimi, status:"tehtud", date:r.kuupaev || today(), part:x.kood||"", price:String(x.hind||""), shop:r.pood||"", by:who||""}));
        if(await write(() => api("/api/log", "POST", {entries}))){ b.textContent = "✓ Lisatud"; }
        else b.disabled = false;
      }
      if(act === "keep"){
        b.disabled = true; b.textContent = "Salvestan…";
        try{
          const { id: pid } = await api("/api/img", "POST", {image});
          const title = r.liik === "tuli" ? "Armatuurlaua tuli: " + (r.vastus||"").slice(0,60) : r.liik === "kahjustus" ? "Kahjustus: " + (r.vastus||"").slice(0,60) : r.nimi || "Pilt";
          await write(() => api("/api/log", "POST", {entry:{carId:c.id, title, status: r.liik === "kahjustus" || r.liik === "tuli" ? "vaja" : "tehtud", date:today(), part:r.kood||"", note:r.vastus||"", photos:[pid], by:who||""}}));
          b.textContent = "✓ Salvestatud";
        }catch(e){ b.disabled = false; b.textContent = "Salvesta pilt tööde alla"; banner("Salvestamine ei õnnestunud."); }
      }
    });
  }

  // ---------- vahekaardid ----------
  function showTab(t){
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    document.querySelectorAll(".tab-panel").forEach(p => p.hidden = p.dataset.tab !== t);
    store.set("garaaz.tab", t);
    scrollTo({top: 0, behavior: "smooth"});
  }
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  showTab(store.get("garaaz.tab") || "osad");

  // ---------- hele / tume ----------
  function applyTheme(t){
    if(t === "dark") document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0a0c0f" : "#eef1f5";
    document.querySelectorAll(".theme-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === t)));
  }
  document.querySelectorAll(".theme-btn").forEach(b => b.onclick = () => { store.set("garaaz.theme", b.dataset.themeSet); applyTheme(b.dataset.themeSet); });
  applyTheme(store.get("garaaz.theme") === "dark" ? "dark" : "light");

  // ---------- iseuuendus: kui uus versioon on üleval, laeme selle (mööda vahemälust) ----------
  const APP_V = "7";
  async function checkUpdate(){
    try{
      const v = (await (await fetch("version.txt?" + Date.now(), {cache:"no-store"})).text()).trim();
      if(v && v !== APP_V) location.replace(location.pathname + "?v=" + v);
    }catch(e){}
  }
  checkUpdate();
  addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") checkUpdate(); });

  // ---------- algus ----------
  if(!key){ banner("Ava äpp lingiga, mille said (seal on sinu pere võti)."); $("plates").innerHTML = ""; }
  else { refresh(); addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") refresh(); }); }
})();
