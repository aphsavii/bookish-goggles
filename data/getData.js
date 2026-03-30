import fs from 'fs';

const getExchToken = (symbol) => {
    const data = JSON.parse(fs.readFileSync("data/scripMaster.json"));
    return data[symbol];
}


export  {getExchToken};