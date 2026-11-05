-- =====================================================================
--  MAC CHICKEN — script.sql (Optimizado para InfinityFree)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `detalle_pedidos`;
DROP TABLE IF EXISTS `pedidos`;
DROP TABLE IF EXISTS `reservas`;
DROP TABLE IF EXISTS `productos`;
DROP TABLE IF EXISTS `horarios`;
DROP TABLE IF EXISTS `configuracion`;
DROP TABLE IF EXISTS `usuarios`;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  1. USUARIOS  (login del administrador)
-- ---------------------------------------------------------------------
CREATE TABLE `usuarios` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `nombre`         VARCHAR(80)  NOT NULL,
    `usuario`        VARCHAR(40)  NOT NULL,
    `password_hash`  VARCHAR(255) NOT NULL,          -- password_hash() de PHP, nunca texto plano
    `activo`         TINYINT(1)   NOT NULL DEFAULT 1,
    `ultimo_acceso`  DATETIME     NULL,
    `fecha_creacion` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_usuarios_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  2. PRODUCTOS  (la carta)
-- ---------------------------------------------------------------------
CREATE TABLE `productos` (
    `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `nombre`        VARCHAR(100)  NOT NULL,
    `descripcion`   VARCHAR(255)  NOT NULL DEFAULT '',
    `precio`        DECIMAL(8,2)  NOT NULL,
    `categoria`     VARCHAR(30)   NOT NULL DEFAULT 'pollo',
    `imagen`        VARCHAR(255)  NOT NULL DEFAULT '',
    `etiqueta`      VARCHAR(40)   NULL,               -- "El favorito", "Combo"… (opcional)
    `estado_activo` TINYINT(1)    NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_productos_categoria` (`categoria`),
    KEY `idx_productos_activo` (`estado_activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  3. PEDIDOS  (seguimiento en tiempo real + historial de ventas + SUNAT)
-- ---------------------------------------------------------------------
CREATE TABLE `pedidos` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `codigo`              VARCHAR(12)  NULL,
    `cliente`             VARCHAR(100) NOT NULL,
    `telefono`            VARCHAR(20)  NULL,
    `direccion`           VARCHAR(255) NULL,
    `tipo`                ENUM('delivery','recojo') NOT NULL DEFAULT 'delivery',
    `metodo_pago`         ENUM('efectivo','yape','plin') NOT NULL DEFAULT 'efectivo',
    `notas`               VARCHAR(500) NULL,
    `subtotal`            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `costo_envio`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `total`               DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `estado`              ENUM('pendiente','en proceso','en camino','entregado') NOT NULL DEFAULT 'pendiente',
    `eta_minutos`         SMALLINT UNSIGNED NULL,

    -- Fase SUNAT y comprobantes
    `tipo_comprobante`    ENUM('ticket','boleta','factura') NOT NULL DEFAULT 'ticket',
    `tipo_documento_cliente` ENUM('dni','ruc') NULL,
    `numero_documento_cliente` VARCHAR(11) NULL,
    `serie`               VARCHAR(4)   NULL,
    `numero_comprobante`  INT UNSIGNED NULL,
    `igv`                 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `estado_envio_sunat`  ENUM('no_aplica','pendiente','enviado','observado','rechazado') NOT NULL DEFAULT 'no_aplica',

    `fecha_creacion`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `fecha_actualizacion` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_pedidos_codigo` (`codigo`),
    KEY `idx_pedidos_estado` (`estado`),
    KEY `idx_pedidos_fecha` (`fecha_creacion`)
) ENGINE=InnoDB AUTO_INCREMENT=1001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  4. DETALLE_PEDIDOS  (platos de cada pedido)
-- ---------------------------------------------------------------------
CREATE TABLE `detalle_pedidos` (
    `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `pedido_id`       INT UNSIGNED  NOT NULL,
    `producto_id`     INT UNSIGNED  NULL,
    `nombre_producto` VARCHAR(100)  NOT NULL,
    `cantidad`        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    `precio_unitario` DECIMAL(8,2)  NOT NULL,
    `subtotal`        DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_detalle_pedido` (`pedido_id`),
    CONSTRAINT `fk_detalle_pedido`
        FOREIGN KEY (`pedido_id`)   REFERENCES `pedidos`(`id`)   ON DELETE CASCADE,
    CONSTRAINT `fk_detalle_producto`
        FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  5. RESERVAS  (mesas)
-- ---------------------------------------------------------------------
CREATE TABLE `reservas` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `nombre`         VARCHAR(100) NOT NULL,
    `telefono`       VARCHAR(20)  NOT NULL,
    `personas`       TINYINT UNSIGNED NOT NULL,
    `fecha`          DATE         NOT NULL,
    `hora`           TIME         NOT NULL,
    `notas`          VARCHAR(500) NULL,
    `estado`         ENUM('pendiente','confirmada','cancelada') NOT NULL DEFAULT 'pendiente',
    `fecha_creacion` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_reservas_fecha` (`fecha`, `hora`),
    KEY `idx_reservas_estado` (`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  6. CONFIGURACION Y HORARIOS
-- ---------------------------------------------------------------------
CREATE TABLE `configuracion` (
    `clave`       VARCHAR(50)  NOT NULL,
    `valor`       VARCHAR(255) NOT NULL DEFAULT '',
    `actualizado` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `horarios` (
    `dia_semana` TINYINT UNSIGNED NOT NULL,
    `abre`       TIME NOT NULL DEFAULT '12:00:00',
    `cierra`     TIME NOT NULL DEFAULT '23:00:00',
    `activo`     TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`dia_semana`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  DATOS INICIALES
-- =====================================================================

-- Administrador (contraseña: MacChicken2026!)
INSERT INTO `usuarios` (`nombre`, `usuario`, `password_hash`) VALUES
('Administrador', 'admin', '$2y$10$1Z7smkZGywPi3eklVD21FONUJy1FqOQh5QglQa4dQAEd13iioVI.2');

INSERT INTO `configuracion` (`clave`, `valor`) VALUES
('modo_local',     'auto'),
('mensaje_cierre', 'Volvemos pronto. Puedes dejar tu pedido y lo atendemos al abrir.'),
('costo_delivery', '0');

INSERT INTO `horarios` (`dia_semana`, `abre`, `cierra`, `activo`) VALUES
(0, '12:00:00', '23:00:00', 1),   -- domingo
(1, '12:00:00', '23:00:00', 0),   -- lunes (cerrado)
(2, '12:00:00', '23:00:00', 1),   -- martes
(3, '12:00:00', '23:00:00', 1),   -- miércoles
(4, '12:00:00', '23:00:00', 1),   -- jueves
(5, '12:00:00', '23:00:00', 1),   -- viernes
(6, '12:00:00', '23:00:00', 1);   -- sábado

-- Carta actual de productos
INSERT INTO `productos` (`nombre`, `descripcion`, `precio`, `categoria`, `imagen`, `etiqueta`, `estado_activo`) VALUES
('1/4 pollo a la brasa',     'Con papas, ensalada y cremas',     18.50, 'pollo',     'img/pollo3.jpg',      'El favorito',    1),
('1/2 pollo a la brasa',     'Con papas, ensalada y cremas',     37.00, 'pollo',     'img/pollo2.jpg',      NULL,             1),
('Pollo entero a la brasa',  'Con papas, ensalada y cremas',     65.00, 'pollo',     'img/pollo1.jpg',      'Para compartir', 1),
('Mostrito brasa',           'Arroz chaufa + papas + ensalada',  22.00, 'pollo',     'img/pollo4.jpg',      'Combo',          1),
('Pollo a la plancha',       'Con papas, ensalada y cremas',     18.50, 'pollo',     'img/pollo5.jpg',      NULL,             1),
('Arroz chaufa',             'Chaufa con pollo a la brasa',      16.00, 'pollo',     'img/chaufa.jpg',      NULL,             1),
('Mollejitas fritas',        'Con papas, ensalada y cremas',     16.00, 'pollo',     'img/pollo6.jpg',      NULL,             1),
('Chicharrón de pollo',      'Con papas, ensalada y cremas',     17.50, 'pollo',     'img/pollo8.jpg',      NULL,             1),
('Salchipapa',               'Salchicha + papas fritas',         10.00, 'pollo',     'img/pollo7.jpg',      NULL,             1),
('Porción de papas',         'Papas fritas crujientes',           8.00, 'pollo',     'img/papas.jpg',       NULL,             1),
('Porción de ensalada',      'Ensalada fresca',                   6.00, 'pollo',     'img/ensa.jpg',        NULL,             1),
('Porción de arroz blanco',  'Arroz blanco graneado',             3.50, 'pollo',     'img/arroz.jpg',       NULL,             1),
('Inca Kola 1.5L',           'Gaseosa familiar',                  8.00, 'bebidas',   'img/inca.jpg',        NULL,             1),
('Inca Kola 1L',             'Gaseosa mediana',                   7.00, 'bebidas',   'img/inca2.jpg',       NULL,             1),
('Inca Kola 600ml',          'Gaseosa personal',                  4.00, 'bebidas',   'img/inca3.jpg',       NULL,             1),
('Coca Cola 1.5L',           'Gaseosa familiar',                  8.00, 'bebidas',   'img/coca.jpg',        NULL,             1),
('Coca Cola 1L',             'Gaseosa mediana',                   7.00, 'bebidas',   'img/coca2.jpg',       NULL,             1),
('Coca Cola 600ml',          'Gaseosa personal',                  4.00, 'bebidas',   'img/coca3.jpg',       NULL,             1),
('Agua San Luis 625ml',      'Agua mineral sin gas',              2.00, 'bebidas',   'img/sanluis.jpg',     NULL,             1),
('Té filtrante',             'Bebida caliente natural',           3.00, 'calientes', 'img/te.jpg',          NULL,             1),
('Manzanilla filtrante',     'Relajante y digestiva',             2.50, 'calientes', 'img/manzanilla.jpg',  NULL,             1);