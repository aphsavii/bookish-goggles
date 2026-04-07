
const filterOnGapPct = (stocks) => {

    let instruments = stocks.instruments;
    instruments.sort((a, b) => {
        return Math.abs(b.gapPct)-Math.abs(a.gapPct) ;
    });
    return instruments.filter(stock => Math.abs(stock.gapPct) > 1.2);

}

export default filterOnGapPct;