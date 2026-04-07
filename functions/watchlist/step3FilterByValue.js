const filterByValue = (stocks) => {
    stocks.sort((a,b)=> b.tradedValue-a.tradedValue);
    return stocks;
}
export default filterByValue;