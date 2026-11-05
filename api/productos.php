<?php
/* GET api/productos.php
   → [ { id, name, price, cat, desc, img, tag, disponible }, … ]
   Solo productos activos. Lo consume cargarProductos() de script.js. */
declare(strict_types=1);
require_once __DIR__ . '/../funciones.php';
enviar_cors();

json_out(productos_publicos($pdo));
