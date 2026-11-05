<?php
/* POST api/reservas.php   (JSON)
   Recibe: { nombre, telefono, fecha, hora, personas, notas }
   Responde: { ok: true } */
declare(strict_types=1);
require_once __DIR__ . '/../funciones.php';
enviar_cors();

$in = leer_json();

function rechazar(string $mensaje): void
{
    json_out(['error' => $mensaje], 422);
}

$nombre   = trim((string) ($in['nombre'] ?? ''));
$telefono = trim((string) ($in['telefono'] ?? ''));
$fecha    = (string) ($in['fecha'] ?? '');
$hora     = (string) ($in['hora'] ?? '');
$personas = (int) ($in['personas'] ?? 0);
$notas    = trim((string) ($in['notas'] ?? ''));

if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100)            rechazar('Escribe tu nombre.');
if (!preg_match('/^[0-9+\s-]{7,15}$/', $telefono))                  rechazar('El celular no es válido.');
if ($personas < 1 || $personas > 12)                                rechazar('El número de personas no es válido.');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha))                   rechazar('La fecha no es válida.');
if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora))              rechazar('La hora no es válida.');
if (mb_strlen($notas) > 500) $notas = mb_substr($notas, 0, 500);

$f = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha, new DateTimeZone('America/Lima'));
if (!$f || $f->format('Y-m-d') !== $fecha) rechazar('La fecha no es válida.');
if ($f < new DateTimeImmutable('today', new DateTimeZone('America/Lima'))) rechazar('Elige una fecha desde hoy.');

// La hora debe caer dentro del horario de ese día
$dia = (int) $f->format('w');
$h   = obtener_horarios($pdo)[$dia];
if ($h === null) rechazar('Ese día no atendemos. Elige otra fecha.');
if (a_minutos($hora) < a_minutos($h['abre']) || a_minutos($hora) >= a_minutos($h['cierra'])) {
    rechazar('Esa hora está fuera de nuestro horario de atención.');
}

$st = $pdo->prepare(
    'INSERT INTO reservas (nombre, telefono, personas, fecha, hora, notas) VALUES (?, ?, ?, ?, ?, ?)'
);
$st->execute([$nombre, $telefono, $personas, $fecha, $hora . ':00', $notas !== '' ? $notas : null]);

json_out(['ok' => true], 201);
