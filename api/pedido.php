<?php
/* GET api/pedido.php?codigo=MC-1001
   Seguimiento del pedido. Responde con la forma exacta que espera
   renderPedido() de script.js. No expone nombre, teléfono ni dirección. */
declare(strict_types=1);
require_once __DIR__ . '/../funciones.php';
enviar_cors();

$codigo = strtoupper(trim((string) ($_GET['codigo'] ?? '')));
if (!preg_match('/^MC-\d{3,9}$/', $codigo)) {
    json_out(['error' => 'Código no válido.'], 404);
}

$st = $pdo->prepare(
    'SELECT id, codigo, tipo, estado, eta_minutos, total, fecha_actualizacion
       FROM pedidos WHERE codigo = ?'
);
$st->execute([$codigo]);
$p = $st->fetch();
if (!$p) {
    json_out(['error' => 'No encontrado.'], 404);
}

$st = $pdo->prepare('SELECT nombre_producto AS nombre, cantidad AS cant FROM detalle_pedidos WHERE pedido_id = ? ORDER BY id');
$st->execute([$p['id']]);
$items = array_map(static fn(array $i): array => ['nombre' => $i['nombre'], 'cant' => (int) $i['cant']], $st->fetchAll());

$entregado = $p['estado'] === 'entregado';
$fecha = new DateTimeImmutable($p['fecha_actualizacion'], new DateTimeZone('America/Lima'));

json_out([
    'codigo'      => $p['codigo'],
    'estado'      => ESTADO_PUBLICO[$p['estado']] ?? 'recibido',
    'tipo'        => $p['tipo'],
    'eta'         => $entregado ? 0 : ($p['eta_minutos'] !== null ? (int) $p['eta_minutos'] : null),
    'total'       => (float) $p['total'],
    'actualizado' => $fecha->format('c'),
    'items'       => $items,
]);
