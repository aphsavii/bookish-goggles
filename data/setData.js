import fs from 'fs';

const setData = (data)=>{
    fs.writeFileSync('data/watchlist.json',JSON.stringify(data,null,2));
}

export {setData};