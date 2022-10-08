const clock = document.querySelector("#clock");

function getTime(){
    const currentDate = new Date();
    const currentHour = String(currentDate.getHours()).padStart(2, "0");
    const currentMin = String(currentDate.getMinutes()).padStart(2, "0");
    clock.innerText = `${currentHour}:${currentMin}`;
}

getTime();
setInterval(getTime, 1000);