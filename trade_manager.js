// ==============================
// NTW TRADE MANAGER
// ==============================

// เก็บออเดอร์ปัจจุบัน
let currentTrade = null

// เปิดออเดอร์
function openTrade(signal,pattern,price){

currentTrade = {

signal:signal,
pattern:pattern,
entry:price,
time:Date.now()

}

console.log("OPEN TRADE:",currentTrade)

}

// ปิดออเดอร์
function closeTrade(price){

if(!currentTrade) return

let result = "LOSS"

if(currentTrade.signal==="BUY" && price>currentTrade.entry){
result="WIN"
}

if(currentTrade.signal==="SELL" && price<currentTrade.entry){
result="WIN"
}

// ======================
// AI LEARNING
// ======================

learnTrade(currentTrade.pattern,result)

console.log("CLOSE TRADE:",result)

// reset
currentTrade=null

}