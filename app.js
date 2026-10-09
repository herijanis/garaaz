(() => {
  const API = "https://garaaz.garaaz-worker.workers.dev";
  const $ = id => document.getElementById(id);
  const STATUS = {vaja:"Vaja teha",tellitud:"Tellitud",tehtud:"Tehtud",vale:"Vale osa"};
  let key = null, cars = [], logs = [], selId = null, editId = null;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch(e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch(e) {} },
  };
  selId = store.get("garaaz.sel");

  // võti tuleb lingist (#k=...) ja jääb telefoni meelde
  const m = location.hash.match(/k=([A-Za-z0-9_-]+)/);
  if(m){ key = m[1]; store.set("garaaz.key", key); history.replaceState(null, "", location.pathname); }
  else key = store.get("garaaz.key");

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmtDate = iso => { if(!iso) return ""; const [y,m,d] = iso.split("-"); return d ? `${d}.${m}.${y}` : iso; };
  const car = () => cars.find(c => c.id === selId);
  const banner = msg => { $("banner").textContent = msg; $("banner").hidden = !msg; };

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
      banner(""); renderPlates(); renderCar(); renderLog();
    }catch(e){
      $("plates").innerHTML = "";
      banner(e.status === 401 ? "See link on vale või vana. Küsi õige link." : "Andmed ei laadinud. Kontrolli internetti ja laadi leht uuesti.");
    }
  }

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
    ["carPanel","askPanel","logPanel"].forEach(id => $(id).hidden = !c);
    if(!c) return;
    $("carName").textContent = `${c.make||""} ${c.model||""}`.trim();
    const spec = [["Numbrimärk",c.plate,1],["VIN",c.vin,1],["Mootorikood",c.engine,1],["Mootor",c.motor],["Esmane reg.",c.first],
      ["Läbisõit",c.km?Number(c.km).toLocaleString("et-EE")+" km":""],["Käigukast",c.gear],["Kere",c.body],["Kelle oma",c.owner]];
    $("carSpec").innerHTML = spec.filter(s => s[1]).map(([k,v,m]) => `<div><dt>${k}</dt><dd${m?' class="mono"':''}>${esc(v)}</dd></div>`).join("");
    $("carNotes").textContent = c.notes || "";
    $("carNotes").hidden = !c.notes;
    const vin = $("lnkVin");
    vin.hidden = !c.vin;
    if(c.vin) vin.href = "https://partsouq.com/en/search/all?q=" + encodeURIComponent(c.vin);
  }

  function renderLog(){
    const ul = $("log");
    const mine = logs.filter(l => l.carId === selId).sort((a,b) => {
      const open = s => s === "vaja" || s === "tellitud" ? 0 : 1;
      return open(a.status) - open(b.status) || String(b.date||"").localeCompare(String(a.date||""));
    });
    if(!mine.length){ ul.innerHTML = `<li><span></span><p class="empty">Kirjeid pole. Lisa siia, mis vaja teha või mis tehtud sai.</p></li>`; return; }
    ul.innerHTML = mine.map(l => {
      const meta = [fmtDate(l.date), l.part && `<span class="mono">${esc(l.part)}</span>`, l.price && `${esc(l.price)} €`, l.shop && esc(l.shop)].filter(Boolean).join(" · ");
      return `<li data-id="${esc(l.id)}">
        <span class="pill s-${esc(l.status)}">${STATUS[l.status]||esc(l.status)}</span>
        <div class="body">
          <span class="title">${esc(l.title)}</span>
          ${meta?`<span class="meta">${meta}</span>`:""}
          ${l.note?`<span class="meta">${esc(l.note)}</span>`:""}
          <div class="acts">
            <select aria-label="Muuda olekut">${Object.entries(STATUS).map(([k,v]) => `<option value="${k}"${k===l.status?" selected":""}>${v}</option>`).join("")}</select>
            <button type="button" class="del">Kustuta</button>
          </div>
        </div></li>`;
    }).join("");
    ul.querySelectorAll("li[data-id]").forEach(li => {
      const id = li.dataset.id;
      li.querySelector("select").onchange = e => write(() => api("/api/log/"+id, "PATCH", {patch:{status:e.target.value}}));
      const del = li.querySelector(".del");
      del.onclick = () => {
        if(del.dataset.armed){ write(() => api("/api/log/"+id, "DELETE")); return; }
        del.dataset.armed = "1"; del.textContent = "Kindel? Kustuta"; del.classList.add("danger");
        setTimeout(() => { if(del.isConnected){ delete del.dataset.armed; del.textContent = "Kustuta"; del.classList.remove("danger"); } }, 4000);
      };
    });
  }

  function select(id){
    selId = id; store.set("garaaz.sel", id);
    $("answer").hidden = true; $("opts").innerHTML = ""; $("checkBox").hidden = true;
    renderPlates(); renderCar(); renderLog();
  }

  async function write(fn){
    try { await fn(); await refresh(); return true; }
    catch(e){ banner(e.status === 401 ? "See link on vale või vana. Küsi õige link." : "Salvestamine ei õnnestunud. Proovi uuesti."); return false; }
  }

  // car form
  const CF = {plate:"cPlate",owner:"cOwner",make:"cMake",model:"cModel",vin:"cVin",engine:"cEngine",motor:"cMotor",first:"cFirst",km:"cKm",gear:"cGear",body:"cBody",notes:"cNotes"};
  function openCarForm(c){
    editId = c ? c.id : null;
    $("carFormTitle").textContent = c ? "Muuda auto andmeid" : "Lisa auto";
    for(const [k,id] of Object.entries(CF)) $(id).value = c ? (c[k] ?? "") : "";
    $("carFormPanel").hidden = false;
    $("carFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }
  $("editCar").onclick = () => openCarForm(car());
  $("cancelCar").onclick = () => { $("carFormPanel").hidden = true; };
  $("carForm").onsubmit = async e => {
    e.preventDefault();
    const data = {};
    for(const [k,id] of Object.entries(CF)) data[k] = $(id).value.trim();
    data.plate = data.plate.toUpperCase().replace(/\s+/g,"");
    data.vin = data.vin.toUpperCase();
    const id = editId || data.plate.replace(/[^A-Z0-9]/g,"");
    selId = id; store.set("garaaz.sel", id);
    if(await write(() => api("/api/car/"+encodeURIComponent(id), "POST", {car:data}))) $("carFormPanel").hidden = true;
  };

  // log form
  $("lDate").value = new Date().toISOString().slice(0,10);
  $("logForm").onsubmit = async e => {
    e.preventDefault();
    if(!selId) return;
    const entry = {carId:selId, title:$("lTitle").value.trim(), status:$("lStatus").value, date:$("lDate").value,
      part:$("lPart").value.trim(), price:$("lPrice").value.trim(), shop:$("lShop").value.trim(), note:$("lNote").value.trim()};
    if(!entry.title) return;
    if(await write(() => api("/api/log", "POST", {entry}))){
      ["lTitle","lPart","lPrice","lShop","lNote"].forEach(id => $(id).value = "");
      $("addDetails").open = false;
    }
  };

  // ask
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
    return list.map(([n,f]) => `<a${used?' class="used"':''} href="${esc(f(code, base))}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join("");
  }
  function renderAnswer(r, c){
    const base = `${c.make||""} ${c.model||""}`.trim();
    $("answer").textContent = r.vastus || ""; $("answer").hidden = !r.vastus;
    const opts = Array.isArray(r.variandid) ? r.variandid.slice(0,4) : [];
    $("opts").innerHTML = opts.map(o => {
      const code = String(o.kood || "").trim();
      const q = code || `${base} ${o.nimi||""}`.trim();
      const used = o.tuup === "kasutatud";
      const link = safeUrl(o.link);
      return `<div class="opt">
        <div class="opt-top"><span class="opt-name">${esc(o.nimi||"")}${TYPE[o.tuup]?`<span class="tag">${TYPE[o.tuup]}</span>`:""}</span>${o.hind?`<span class="opt-price">${esc(o.hind)}</span>`:""}</div>
        ${code?`<span class="opt-code">${esc(code)}</span>`:""}
        ${o.miks?`<p class="opt-why">${esc(o.miks)}</p>`:""}
        ${link?`<a class="buy" href="${esc(link)}" target="_blank" rel="noopener">Vaata ${esc(o.pood||"poes")} ↗</a>`:""}
        <div class="shops">${shopLinks(q, base, used)}</div>
      </div>`;
    }).join("");
    const chk = Array.isArray(r.kontrolli) ? r.kontrolli.slice(0,3) : [];
    $("checkList").innerHTML = chk.map(t => `<li>${esc(t)}</li>`).join("");
    $("checkBox").hidden = !chk.length;
  }
  function fallback(c, q, msg){
    renderAnswer({vastus: msg, variandid:[{nimi:q, kood:"", tuup:""}], kontrolli:["Vaata vana osa pealt tähist või OEM-numbrit ja otsi selle järgi."]}, c);
  }
  let asking = false;
  $("askForm").onsubmit = async e => {
    e.preventDefault();
    const c = car(); const q = $("askInput").value.trim();
    if(!c || !q || asking) return;
    asking = true;
    $("opts").innerHTML = ""; $("answer").hidden = true; $("checkBox").hidden = true;
    const st = $("askStatus"); st.hidden = false; $("askBtn").disabled = true;
    const t0 = Date.now();
    const tick = setInterval(() => { st.textContent = `Otsin poodidest päris pakkumisi… ${Math.round((Date.now()-t0)/1000)} s`; }, 500);
    try{
      const r = await api("/api/ask", "POST", {carId:c.id, q});
      if(r && typeof r === "object") renderAnswer(r, c); else fallback(c, q, "Vastus tuli segane. Otsi poodidest otse:");
    }catch(err){
      fallback(c, q, (err.message && err.status !== 500 ? err.message + " " : "Vastust ei tulnud. ") + "Otsi poodidest otse:");
    }finally{ clearInterval(tick); st.hidden = true; $("askBtn").disabled = false; asking = false; }
  };

  // boot
  if(!key){ banner("Ava äpp lingiga, mille said (seal on sinu pere võti)."); $("plates").innerHTML = ""; }
  else { refresh(); addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") refresh(); }); }
})();
