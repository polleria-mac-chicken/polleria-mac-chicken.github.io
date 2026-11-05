<?php
/* GET api/estado.php
   → { abierto, cierraPronto, detalle, modo, horario, costoDelivery }
   Lo consume obtenerEstado() de script.js (cada minuto). */
declare(strict_types=1);
require_once __DIR__ . '/../funciones.php';
enviar_cors();

json_out(calcular_estado($pdo));
