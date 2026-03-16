// ==============================
// TRADE EXECUTION
// ==============================

let currentPosition=null

function openTrade(signal,price){

if(currentPosition) return

currentPosition={
side:signal,
entry:price,
time:Date.now()
}

console.log("OPEN",signal,price)

}

function closeTrade(price){

if(!currentPosition) return

let profit=0

if(currentPosition.side==="BUY")
profit = price-currentPosition.entry
else
profit = currentPosition.entry-price

console.log("CLOSE",profit)

currentPosition=null

}

module.exports={
openTrade,
closeTrade
}