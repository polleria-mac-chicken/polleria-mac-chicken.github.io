-- =====================================================================
--  MAC CHICKEN — migracion_sunat.sql
--
--  Úsalo SOLO si ya tenías la base de datos `bd_macchicken` creada antes
--  de este cambio (por ejemplo, en InfinityFree, con pedidos guardados).
--  Agrega a la tabla `pedidos` las columnas para la futura fase SUNAT,
--  sin borrar nada de lo que ya tienes.
--
--  Si vas a crear la base de datos desde cero, no uses este archivo:
--  importa directamente `script.sql`, que ya las incluye.
--
--  CÓMO USARLO (phpMyAdmin de InfinityFree)
--  1. Entra a tu panel de InfinityFree → MySQL Databases → phpMyAdmin.
--  2. Elige la base `if0_XXXXXXXX_bd_macchicken` → pestaña "SQL".
--  3. Pega todo este archivo y presiona "Continuar".
-- =====================================================================

ALTER TABLE `pedidos`
    ADD COLUMN `tipo_comprobante` ENUM('ticket','boleta','factura') NOT NULL DEFAULT 'ticket' AFTER `eta_minutos`,
    ADD COLUMN `tipo_documento_cliente` ENUM('dni','ruc') NULL AFTER `tipo_comprobante`,
    ADD COLUMN `numero_documento_cliente` VARCHAR(11) NULL AFTER `tipo_documento_cliente`,
    ADD COLUMN `serie` VARCHAR(4) NULL AFTER `numero_documento_cliente`,
    ADD COLUMN `numero_comprobante` INT UNSIGNED NULL AFTER `serie`,
    ADD COLUMN `igv` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `numero_comprobante`,
    ADD COLUMN `estado_envio_sunat` ENUM('no_aplica','pendiente','enviado','observado','rechazado') NOT NULL DEFAULT 'no_aplica' AFTER `igv`;
