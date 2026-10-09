// Tähtajad: õlivahetus, ülevaatus, kindlustus, rehvid. Sama fail on ka lehel (site/due.js).
// level: "red" = üle aja, "yellow" = varsti, "ok" = korras.

function dueList(cars, now) {
  const out = [];
  const day = 864e5;
  const fmt = d => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const parseDate = s => {
    if (!s) return null;
    let m = String(s).match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (m) return m[3] ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(+m[1], +m[2], 0); // kuu = kuu viimane päev
    m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(+m[3], m[2] - 1, +m[1]);
    m = String(s).match(/^(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(+m[2], +m[1], 0);
    return null;
  };
  const byDate = (id, car, label, date) => {
    if (!date) return;
    const left = Math.ceil((date - now) / day);
    const level = left < 0 ? "red" : left <= 30 ? "yellow" : "ok";
    const text = left < 0 ? `${label} on üle aja (${fmt(date)})` : left <= 30 ? `${label} ${left} päeva pärast (${fmt(date)})` : `${label}: ${fmt(date)}`;
    out.push({ id: `${car.id}:${id}`, carId: car.id, plate: car.plate, kind: id, level, text, left });
  };

  for (const car of Object.values(cars || {})) {
    byDate("inspection", car, "Ülevaatus", parseDate(car.inspection));
    byDate("insurance", car, "Kindlustus lõpeb", parseDate(car.insurance));

    // õli: km või aeg, kumb enne tuleb
    const everyKm = Number(car.oilEveryKm) || 15000;
    const everyMonths = Number(car.oilEveryMonths) || 12;
    const oilKm = Number(car.oilKm), km = Number(car.km), oilDate = parseDate(car.oilDate);
    if (oilKm || oilDate) {
      const kmLeft = oilKm && km ? oilKm + everyKm - km : null;
      const dateDue = oilDate ? new Date(oilDate.getFullYear(), oilDate.getMonth() + everyMonths, oilDate.getDate()) : null;
      const daysLeft = dateDue ? Math.ceil((dateDue - now) / day) : null;
      const red = (kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft < 0);
      const yellow = !red && ((kmLeft !== null && kmLeft <= 1500) || (daysLeft !== null && daysLeft <= 30));
      const parts = [];
      if (kmLeft !== null) parts.push(kmLeft > 0 ? `${kmLeft.toLocaleString("et-EE")} km pärast` : `${(-kmLeft).toLocaleString("et-EE")} km üle`);
      if (dateDue) parts.push(`hiljemalt ${fmt(dateDue)}`);
      out.push({ id: `${car.id}:oil`, carId: car.id, plate: car.plate, kind: "oil", level: red ? "red" : yellow ? "yellow" : "ok",
        text: red ? `Õlivahetus on üle aja (${parts.join(", ")})` : `Õlivahetus ${parts.join(", ")}`, left: daysLeft ?? 999 });
    }
  }

  // rehvid (kõik autod korraga)
  const m = now.getMonth() + 1, d = now.getDate();
  let tire = null;
  if (m === 10 || m === 11) tire = { level: "yellow", text: "Talverehvide aeg: naastrehvid lubatud alates 15.10, talverehvid kohustuslikud 1.12" };
  else if (m === 12 && d === 1) tire = { level: "red", text: "Talverehvid on alates tänasest kohustuslikud" };
  else if (m === 3 && d >= 15) tire = { level: "yellow", text: "Naastrehvid peavad 31.03 all olema (ilma järgi võib pikendada)" };
  else if (m === 4 && d <= 15) tire = { level: "yellow", text: "Suverehvide aeg: naastrehvid maha" };
  if (tire) out.push({ id: `all:tire:${now.getFullYear()}-${m < 6 ? "spring" : "autumn"}`, carId: null, plate: "Kõik autod", kind: "tire", left: 0, ...tire });

  const rank = { red: 0, yellow: 1, ok: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.left - b.left);
}
window.dueList = dueList;
