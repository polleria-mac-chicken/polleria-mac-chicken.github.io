const products = [
    { id: 0, name: "Té filtrante", price: 3, cat: "calientes", desc: "Bebida caliente natural", img: "img/te.jpg" },
    { id: 1, name: "Manzanilla filtrante", price: 2.5, cat: "calientes", desc: "Relajante y digestiva", img: "img/manzanilla.jpg" },
    { id: 2, name: "1/4 pollo a la brasa", price: 18.5, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo3.jpg" },
    { id: 3, name: "Pollo entero a la brasa", price: 65, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo1.jpg" },
    { id: 4, name: "1/2 pollo a la brasa", price: 37, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo2.jpg" },
    { id: 5, name: "Agua San Luis 625ml", price: 2, cat: "bebidas", desc: "Agua mineral sin gas", img: "img/sanluis.jpg" },
    { id: 6, name: "Inca Kola 1.5L", price: 8, cat: "bebidas", desc: "Gaseosa familiar", img: "img/inca.jpg" },
    { id: 7, name: "Inca Kola 600ml", price: 4, cat: "bebidas", desc: "Gaseosa personal", img: "img/inca3.jpg" },
    { id: 8, name: "Inca Kola 1L", price: 7, cat: "bebidas", desc: "Gaseosa mediana", img: "img/inca2.jpg" },
    { id: 9, name: "Pollo a la plancha", price: 18.5, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo5.jpg" },
    { id: 10, name: "Coca Cola 600ml", price: 4, cat: "bebidas", desc: "Gaseosa personal", img: "img/coca3.jpg" },
    { id: 11, name: "Gaseosa Coca Cola 1L", price: 7, cat: "bebidas", desc: "Gaseosa mediana", img: "img/coca2.jpg" },
    { id: 12, name: "Coca Cola 1.5L", price: 8, cat: "bebidas", desc: "Gaseosa familiar", img: "img/coca.jpg" },
    { id: 13, name: "Mostrito brasa", price: 22, cat: "pollo", desc: "Arroz chaufa + papas + ensalada", img: "img/pollo4.jpg" },
    { id: 14, name: "Arroz chaufa", price: 16, cat: "pollo", desc: "Chaufa con pollo a la brasa", img: "img/chaufa.jpg" },
    { id: 15, name: "Mollejitas fritas", price: 16, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo6.jpg" },
    { id: 16, name: "Salchipapa", price: 10, cat: "pollo", desc: "Salchicha + papas fritas", img: "img/pollo7.jpg" },
    { id: 17, name: "Chicharrón de pollo", price: 17.5, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo8.jpg" },
    { id: 18, name: "Porción de papas", price: 8, cat: "pollo", desc: "Papas fritas crujientes", img: "img/papas.jpg" },
    { id: 19, name: "Porción de ensalada", price: 6, cat: "pollo", desc: "Ensalada fresca", img: "img/ensa.jpg" },
    { id: 20, name: "Porción de arroz blanco", price: 3.5, cat: "pollo", desc: "Arroz blanco graneado", img: "img/arroz.jpg" }
];

let cart = {};
const container = document.getElementById("products");

function render(list) {
    container.innerHTML = ""; 
    list.forEach((p) => {
        container.innerHTML += `
            <div class="card">
                <img src="${p.img}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/150?text=Mac+Chicken'">
                <h3>${p.name}</h3>
                <p>S/ ${p.price.toFixed(2)}</p>
                <div class="controls">
                    <button onclick="remove(${p.id})">-</button>
                    <span id="qty-${p.id}">${cart[p.id] || 0}</span>
                    <button onclick="add(${p.id})">+</button>
                </div>
            </div>`;
    });
}

function toggleCart() {
    document.getElementById("cart").classList.toggle("active");
    document.getElementById("overlay").classList.toggle("active");
}

function filter(cat) {
    if (cat === 'all') render(products);
    else render(products.filter(p => p.cat === cat));
}

function add(id) {
    cart[id] = (cart[id] || 0) + 1;
    update();
    const qtySpan = document.getElementById(`qty-${id}`);
    if(qtySpan) qtySpan.innerText = cart[id];
}

function remove(id) {
    if (cart[id] > 0) {
        cart[id]--;
        if (cart[id] === 0) delete cart[id];
        update();
        const qtySpan = document.getElementById(`qty-${id}`);
        if(qtySpan) qtySpan.innerText = cart[id] || 0;
    }
}

function update() {
    let total = 0;
    let html = "";
    let textoResumen = "";
    let totalItems = 0;

    for (let id in cart) {
        const product = products.find(p => p.id == id);
        if (product && cart[id] > 0) {
            totalItems += cart[id];
            html += `<div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
                        <span>${product.name} x${cart[id]}</span>
                        <span>S/ ${(product.price * cart[id]).toFixed(2)}</span>
                     </div>`;
            textoResumen += `- ${product.name} x${cart[id]}%0A`;
            total += product.price * cart[id];
        }
    }

    document.getElementById("cart-items").innerHTML = html || '<p class="empty-msg">Tu carrito está vacío</p>';
    document.getElementById("total").innerText = total.toFixed(2);
    document.getElementById("cart-count").innerText = totalItems;

    let name = document.getElementById("name").value.trim();
    let loc = document.getElementById("location").value.trim();
    let btn = document.getElementById("whatsapp");

    if (totalItems > 0 && name !== "" && loc !== "") {
        btn.classList.remove("disabled");
        let msg = `*Pedido Mac Chicken*%0A%0A${textoResumen}%0A*Total:* S/ ${total.toFixed(2)}%0A%0A*Cliente:* ${name}%0A*Ubicación:* ${loc}`;
        btn.href = "https://wa.me/51979926808?text=" + msg; 
    } else {
        btn.classList.add("disabled");
    }
}

function checkOrder() {
    if (parseFloat(document.getElementById("total").innerText) === 0) alert("Agrega productos al carrito.");
}

render(products);