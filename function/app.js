/* app.js: client logic for the 3 modules + OpenAI trigger.
   Requires Chart.js loaded in page (already included in index.html).
*/

(() => {
  // helpers
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  function fmt(n){ if (isNaN(n)) return "-"; return "₹"+Math.round(n).toLocaleString("en-IN"); }
  function toNum(str){ return Number(String(str||"").replace(/,/g,"").trim()) || 0; }
  function attachComma(el){
    el && el.addEventListener("input", e => {
      let val = String(e.target.value).replace(/,/g,"").replace(/[^\d]/g,"");
      if (val===""){ e.target.value=""; return; }
      e.target.value = Number(val).toLocaleString("en-IN");
    });
  }

  attachComma($("#monthlyExpense"));
  attachComma($("#moneyInvested"));
  attachComma($("#maxMonthlyInvest"));

  // NAV
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(b => b.classList.remove("active"));
      $$(".page").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.page).classList.add("active");
    });
  });

  // UTIL: create row for tables
  function createRow(tbody, cols){
    const tr = document.createElement("tr");
    cols.forEach(c => {
      const td = document.createElement("td");
      if (c.type === "text"){
        const inp = document.createElement("input");
        inp.type = "text"; inp.value = c.value || "";
        td.appendChild(inp);
      } else if (c.type === "number"){
        const inp = document.createElement("input");
        inp.type = "number"; inp.value = c.value || 0;
        td.appendChild(inp);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    return tr;
  }

  // INIT Asset table (Module1)
  const assetTbody = $("#assetTable tbody");
  const defaultAssets = [
    {name:"Equity", w:60, r:15},
    {name:"Debt", w:25, r:7},
    {name:"Gold", w:15, r:9},
  ];
  defaultAssets.forEach(a => createRow(assetTbody, [
    {type:"text", value:a.name},
    {type:"number", value:a.w},
    {type:"number", value:a.r}
  ]));

  $("#addAssetBtn").addEventListener("click", () => {
    createRow(assetTbody, [{type:"text"},{type:"number",value:0},{type:"number",value:10}]);
  });

  // Charts placeholders
  let allocationChart=null, growthChart=null, existingBar=null, targetBar=null;

  // MODULE 1 Calculate
  $("#calculateBtn").addEventListener("click", ()=> {
    const currentAge = Number($("#currentAge").value);
    const targetAge = Number($("#targetAge").value);
    const monthlyExpense = toNum($("#monthlyExpense").value);
    const lifestyleIncrease = Number($("#lifestyleIncrease").value)||0;
    const inflation = Number($("#inflationRate").value)||0;
    const swr = Number($("#swr").value)||0;
    const moneyInvested = toNum($("#moneyInvested").value);
    const maxMonthly = toNum($("#maxMonthlyInvest").value);
    const allocationMessage = $("#errorMessage");
    allocationMessage.textContent = "";

    if (!currentAge || !targetAge || targetAge<=currentAge){ allocationMessage.textContent="Enter valid ages."; return; }
    if (!monthlyExpense){ allocationMessage.textContent="Enter valid monthly expense."; return; }
    if (!swr || swr<=0){ allocationMessage.textContent="Enter valid SWR."; return; }

    // read assets
    const rows = Array.from(assetTbody.querySelectorAll("tr"));
    if (!rows.length){ allocationMessage.textContent="Add at least one asset."; return; }
    const names=[]; const weights=[]; const rets=[];
    let totalAlloc=0;
    rows.forEach(r=>{
      const tds = r.querySelectorAll("td input");
      const name = tds[0].value || "Asset";
      const w = Number(tds[1].value)||0;
      const rret = Number(tds[2].value)||0;
      names.push(name); weights.push(w); rets.push(rret); totalAlloc+=w;
    });
    if (Math.round(totalAlloc)!==100){ allocationMessage.textContent="Allocation must sum to 100% (currently "+totalAlloc.toFixed(1)+"%)."; return; }

    const years = targetAge - currentAge;
    const futureMonthly = monthlyExpense * (1 + lifestyleIncrease/100) * Math.pow(1 + inflation/100, years);
    const futureAnnual = futureMonthly * 12;
    const corpus = futureAnnual / (swr/100);

    // weighted return (decimal)
    let R = 0;
    for (let i=0;i<weights.length;i++) R += (weights[i]/100)*(rets[i]/100);
    if (R <= 0){ allocationMessage.textContent="Portfolio return must be > 0."; return; }

    const existingFuture = moneyInvested>0 ? moneyInvested * Math.pow(1+R, years) : 0;
    let corpusNeeded = Math.max(0, corpus - existingFuture);
    let alreadyCovered = corpusNeeded <= 0;

    const investmentType = document.querySelector('input[name="investmentType"]:checked').value;
    let requiredInvestment = 0;
    if (!alreadyCovered){
      if (investmentType === "sip"){
        const r_monthly = R/12;
        const n = years*12;
        const denom = Math.pow(1+r_monthly, n) - 1;
        if (denom<=0){ allocationMessage.textContent="Invalid SIP calc."; return; }
        requiredInvestment = (corpusNeeded * r_monthly) / denom;
      } else {
        requiredInvestment = corpusNeeded / Math.pow(1+R, years);
      }
    }

    // Fill results
    $("#corpusDisplay").textContent = fmt(corpus);
    $("#portfolioReturnDisplay").textContent = (R*100).toFixed(2)+"% p.a.";
    $("#requiredAmount").textContent = alreadyCovered ? fmt(0) : (investmentType==="sip" ? fmt(requiredInvestment)+ " / month" : fmt(requiredInvestment));
    $("#requiredNote").textContent = alreadyCovered ? "Existing investments are enough (by assumptions)." : (investmentType==="sip" ? `SIP for ${years} years` : `Lump sum invested today`);
    $("#resultsArea").hidden = false;

    // Allocation chart
    if (allocationChart) allocationChart.destroy();
    allocationChart = new Chart($("#allocationChart"), {
      type:'pie', data:{labels:names, datasets:[{data:weights}]}
    });

    // Growth chart: show invested vs portfolio (SIP or lump)
    if (growthChart) growthChart.destroy();
    const labels = []; const pv=[]; const invested=[];
    if (investmentType==="sip"){
      const r_monthly = R/12; let value=0, inv=0;
      labels.push("0"); pv.push(0); invested.push(0);
      for (let y=1;y<=years;y++){
        for (let m=0;m<12;m++){ value = value*(1+r_monthly) + requiredInvestment; inv += requiredInvestment; }
        labels.push(String(y)); pv.push(Math.round(value)); invested.push(Math.round(inv));
      }
    } else {
      const inv = requiredInvestment;
      labels.push("0"); pv.push(Math.round(inv)); invested.push(Math.round(inv));
      for (let y=1;y<=years;y++){ labels.push(String(y)); pv.push(Math.round(inv*Math.pow(1+R,y))); invested.push(Math.round(inv)); }
    }
    growthChart = new Chart($("#growthChart"), {
      type:'line', data:{labels, datasets:[
        {label:'Portfolio Value', data:pv, borderWidth:2, fill:false},
        {label:'Amount Invested', data:invested, borderWidth:2, fill:false}
      ]}
    });

    // Summary text (human style)
    const summaryBox = $("#summaryBox"); const summaryText = $("#summaryText");
    let summary = `You have ${years} years. Projected lifestyle ~${fmt(futureMonthly)} / month, annual ~${fmt(futureAnnual)}. Corpus needed ≈ ${fmt(corpus)}. `;
    if (alreadyCovered) summary += "Existing investments are enough to cover this corpus by the assumptions used. ";
    else summary += investmentType==="sip" ? `You need ~${fmt(requiredInvestment)}/month as SIP.` : `You need a lump-sum of ${fmt(requiredInvestment)} today.`;
    // capacity check
    if (!alreadyCovered && investmentType==="sip" && maxMonthly>0){
      const gap = maxMonthly - requiredInvestment;
      if (gap >= 0) summary += ` Your stated capacity ${fmt(maxMonthly)}/month covers the requirement.`;
      else summary += ` Your capacity ${fmt(maxMonthly)}/month is below required SIP. Consider changing goal or increase risk.`;
    }
    summaryText.textContent = summary;
    summaryBox.hidden = false;

    // AI button state clear
    $("#aiStatus").textContent = "";
    $("#aiOutput").textContent = "";
  });

  // Module 2 init
  const existingTbody = $("#existingTable tbody");
  [{name:"Equity", amt:400000, r:14},{name:"Debt", amt:300000, r:7},{name:"Gold", amt:200000, r:9}]
  .forEach(x => createRow(existingTbody, [{type:"text",value:x.name},{type:"number",value:x.amt},{type:"number",value:x.r}]));
  $("#addExistingBtn").addEventListener("click", ()=> createRow(existingTbody, [{type:"text"},{type:"number",value:0},{type:"number",value:8}]));

  $("#calcExistingBtn").addEventListener("click", ()=> {
    const years = Number($("#yearsExisting").value);
    $("#existingError").textContent = "";
    if (!years || years<=0){ $("#existingError").textContent="Enter years."; return; }
    const rows = Array.from(existingTbody.querySelectorAll("tr"));
    const names=[]; const amts=[]; const rets=[]; let total=0;
    rows.forEach(r=>{
      const t = r.querySelectorAll("td input");
      const name = t[0].value||"Asset"; const amt = Number(t[1].value)||0; const rr = Number(t[2].value)||0;
      if (amt>0){ names.push(name); amts.push(amt); rets.push(rr); total+=amt; }
    });
    if (total<=0){ $("#existingError").textContent="Enter positive amounts."; return; }
    // weighted return
    const weights = amts.map(a => (a/total)*100);
    let Rp = 0; for (let i=0;i<weights.length;i++) Rp += (weights[i]/100)*(rets[i]/100);
    // future values
    const fvs = amts.map((a,i)=> a*Math.pow(1+rets[i]/100, years));
    const totalFuture = fvs.reduce((s,v)=>s+v,0);
    $("#existingCurrentTotal").textContent = fmt(total);
    $("#existingRp").textContent = (Rp*100).toFixed(2)+"% p.a.";
    $("#existingFutureTotal").textContent = fmt(totalFuture);
    // bar chart
    if (existingBar) existingBar.destroy();
    existingBar = new Chart($("#existingBarChart"), {
      type:'bar',
      data:{labels:names, datasets:[
        {label:'Today', data:amts},
        {label:'Future', data:fvs}
      ]}
    });
    $("#existingResults").hidden = false;
  });

  // Module 3 init
  const targetTbody = $("#targetTable tbody");
  [{name:"Equity", w:60, r:15},{name:"Debt", w:25, r:7},{name:"Gold", w:15, r:9}]
  .forEach(x => createRow(targetTbody, [{type:"text",value:x.name},{type:"number",value:x.w},{type:"number",value:x.r}]));
  $("#addTargetBtn").addEventListener("click", ()=> createRow(targetTbody, [{type:"text"},{type:"number",value:0},{type:"number",value:8}]));

  $("#calcTargetBtn").addEventListener("click", ()=> {
    $("#targetError").textContent = "";
    const targetReturn = Number($("#targetReturn").value);
    const years = Number($("#yearsTarget").value);
    if (!targetReturn || targetReturn<=0){ $("#targetError").textContent="Enter target return."; return; }
    if (!years || years<=0){ $("#targetError").textContent="Enter years."; return; }
    const rows = Array.from(targetTbody.querySelectorAll("tr"));
    if (!rows.length){ $("#targetError").textContent="Add assets."; return; }
    const names=[]; const ws=[]; const rets=[]; let totalW=0;
    rows.forEach(r=>{
      const t = r.querySelectorAll("td input");
      names.push(t[0].value||"Asset"); ws.push(Number(t[1].value)||0); rets.push(Number(t[2].value)||0); totalW+=Number(t[1].value)||0;
    });
    if (Math.round(totalW)!==100){ $("#targetError").textContent="Allocation must total 100% (now "+totalW.toFixed(1)+"%)."; return; }
    let Rp=0; for (let i=0;i<ws.length;i++) Rp += (ws[i]/100)*(rets[i]/100);
    $("#targetRp").textContent = (Rp*100).toFixed(2)+"% p.a.";
    const base=100000;
    const actualFV = base*Math.pow(1+Rp, years);
    const desiredFV = base*Math.pow(1+targetReturn/100, years);
    $("#targetFVs").textContent = `${fmt(actualFV)} (actual) vs ${fmt(desiredFV)} (target)`;
    if (targetBar) targetBar.destroy();
    targetBar = new Chart($("#targetBarChart"), {
      type:'bar',
      data:{labels:['Actual','Target'], datasets:[{label:'₹1,00,000', data:[actualFV, desiredFV]}]}
    });
    $("#targetResults").hidden = false;
  });

  // ---------- OpenAI integration (client side trigger) ----------
  // This calls a serverless endpoint at /api/openai which you must deploy (see serverless code).
  $("#aiSummarizeBtn").addEventListener("click", async () => {
    const text = $("#summaryText").textContent || "";
    if (!text){ $("#aiStatus").textContent="No summary to send."; return; }
    $("#aiStatus").textContent = "Sending to AI...";
    $("#aiOutput").textContent = "";
    try {
      const res = await fetch("/.netlify/functions/openai", { // Netlify functions route; adjust if using Vercel
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({prompt: `Rewrite this financial planner summary in clear, concise professional tone:\n\n${text}`})
      });
      if (!res.ok) throw new Error("OpenAI request failed: "+res.status);
      const data = await res.json();
      $("#aiOutput").textContent = data.text || "(no output)";
      $("#aiStatus").textContent = "AI done";
    } catch (err){
      console.error(err);
      $("#aiStatus").textContent = "AI error: " + (err.message||err);
    }
  });

})();
