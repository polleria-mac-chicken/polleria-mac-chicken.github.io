<?php
/* =========================================================
   MAC CHICKEN — conexion.php
   Conexión PDO a MySQL en producción (InfinityFree).
   Todos los demás archivos PHP hacen:  require_once 'funciones.php';
   y funciones.php carga este archivo. Aquí queda la variable $pdo.
   ========================================================= */
declare(strict_types=1);

/* 🔴 COMPLETAR CON TUS DATOS DE INFINITYFREE (vPanel → MySQL Databases)
   OJO: aunque la web y la base de datos estén en la misma cuenta de
   InfinityFree, DB_HOST NUNCA es "localhost" — InfinityFree aloja el
   MySQL en un servidor aparte con su propio nombre (algo como
   sqlXXX.infinityfree.com). Copia los 4 datos tal cual los muestra tu
   vPanel: el usuario y la base siempre llevan el prefijo if0_XXXXXXXX_. */
const DB_HOST = 'sqlXXX.infinityfree.com';
const DB_NAME = 'if0_XXXXXXXX_bd_macchicken';
const DB_USER = 'if0_XXXXXXXX';
const DB_PASS = 'TU_CONTRASEÑA_DE_MYSQL';

// Toda la web trabaja en hora de Perú (igual que script.js)
date_default_timezone_set('America/Lima');

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // errores como excepciones
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,         // filas como arreglos asociativos
            PDO::ATTR_EMULATE_PREPARES   => false,                    // consultas preparadas reales
        ]
    );
    // Que MySQL use la misma hora que PHP (Lima = UTC-5, sin horario de verano)
    $pdo->exec("SET time_zone = '-05:00'");
} catch (PDOException $e) {
    error_log('[MacChicken] Error de conexión: ' . $e->getMessage());
    http_response_code(500);

    $esApi = str_contains($_SERVER['SCRIPT_NAME'] ?? '', '/api/')
          || str_contains($_SERVER['SCRIPT_NAME'] ?? '', 'admin_acciones');

    if ($esApi) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Sin conexión con la base de datos.']);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><meta charset="utf-8"><title>Mac Chicken</title>'
           . '<body style="font-family:system-ui;padding:2rem;max-width:36rem;margin:auto">'
           . '<h1>No se pudo conectar a la base de datos</h1>'
           . '<p>Revisa en <code>conexion.php</code> que DB_HOST, DB_NAME, DB_USER y DB_PASS sean '
           . 'exactamente los que muestra tu vPanel de InfinityFree (MySQL Databases), y que hayas '
           . 'importado <code>script.sql</code> en phpMyAdmin.</p></body>';
    }
    exit;
}
