const loginForm = document.querySelector("#login-form");
const loginInput = loginForm.querySelector("input");
const greeting = document.querySelector("#greeting");

const HIDDEN_CLASSNAME = "hidden"

function onLoginSubmit(event){
    event.preventDefault();
    loginForm.classList.add(HIDDEN_CLASSNAME);  
    localStorage.setItem("username", loginInput.value);
    displayGreeting();
}

function displayGreeting(){
    greeting.innerText = "Welcome " + localStorage.getItem("username");
    greeting.classList.remove(HIDDEN_CLASSNAME);
}

if(localStorage.getItem("username") === null){
    loginForm.addEventListener("submit",  onLoginSubmit);
    loginForm.classList.remove(HIDDEN_CLASSNAME);
} else{
    displayGreeting();
}