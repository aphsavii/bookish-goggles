import { setData } from "./data/setData.js";
import { fetchAndProcessStocks } from "./functions/getStocks.js";
const MIN_PRICE = process.env.MIN_PRICE;
const MAX_PRICE = process.env.MAX_PRICE;

export const startApp = async () =>{
    const instrumentData = await fetchAndProcessStocks({
        minPrice : MIN_PRICE,
        maxPrice : MAX_PRICE
    });
    setData(instrumentData);
};
