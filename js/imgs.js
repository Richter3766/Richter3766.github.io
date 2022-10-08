const body = document.querySelector("body");

const imgName = []
const imgNum = 11;

for(let i = 0;i < imgNum;i++){
    imgName.push(String(i).padStart(3, "0") + ".jpg");
}

const imgIdx = Math.floor(Math.random()*imgName.length) ;
const curImg = imgName[imgIdx];

body.style.backgroundImage = `url("./img/${curImg}")`;
console.log(imgIdx, curImg);