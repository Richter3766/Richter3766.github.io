API_KEY = "872b6552fcc099ec02e1d48af43ac926"


function onGeoOk(position){
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    fetch(url)
    .then((response) => response.json())
    .then((data) => {
        const city = document.querySelector("#weather span:nth-child(1)");
        const weather = document.querySelector("#weather span:nth-child(2)");
        const temp = document.querySelector("#weather span:nth-child(3)");
        
        city.innerText = `${data.name} /`;
        weather.innerText = data.weather[0].main;
        temp.innerText = data.main.temp + "ºC";
    });
}
function onGeoErr(){
    const fail = document.querySelector("#weather span:first-child");
    fail.innerText = "Can't find your location"
}
navigator.geolocation.getCurrentPosition(onGeoOk, onGeoErr);