const todoForm = document.querySelector("#todo-form");
const input = todoForm.querySelector("input");
const todoList = document.querySelector("#todo-list ul")

let todos = [];
const TODOS_KEY = "todos"

/**
 * set item(key: TODOS_KEY, value: todos) to localStorage
 * @param {list} todos 
 */
function saveTodo(todos){
    localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
}
/**
 * eventlistener for todoForm, if submit happen, then save input value and print
 * @param {*} event 
 */
function handleToDoForm(event){
    event.preventDefault();
    const newToDo = input.value;
    const newTodoObj = {
        text: newToDo,
        id: Date.now(),
    }
    todos.push(newTodoObj);
    input.value = "";

    saveTodo(todos);
    paintToDo(newTodoObj);
}

/**
 * eventlistener for todoDel, if press button, then delete button's parent
 * @param {*} event 
 */
function handleToDoDel(event){
    event.preventDefault();
    const li = event.target.parentNode;
    todos = todos.filter(todo => todo.id !== parseInt(li.id));
    li.remove();
    saveTodo(todos);
}

/**
 * create new "li" element and add to todoList
 * @param {*} newToDo 
 */
function paintToDo(newToDo){
    const li = document.createElement("li");
    const todoText = document.createElement("span");
    const todoDel = document.createElement("button");

    li.id = newToDo.id;
    todoText.innerText = newToDo.text;
    todoDel.innerText = "X";

    todoDel.addEventListener("click", handleToDoDel);
    li.appendChild(todoText);
    li.appendChild(todoDel);

    todoList.appendChild(li);
}

todoForm.addEventListener("submit", handleToDoForm);

const localToDos = localStorage.getItem(TODOS_KEY)
if(localToDos){
    todos = JSON.parse(localToDos)
    todos.forEach(paintToDo);
}