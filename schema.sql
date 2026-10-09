-- Ejecutar en el SQL Editor de Neon
create table if not exists grados (
  id serial primary key,
  nombre text unique not null
);

create table if not exists estudiantes (
  id serial primary key,
  nombre text not null,
  grado_id int references grados(id),
  documento text unique not null,      -- usuario y contraseña
  peso numeric(5,2),                   -- kg, manual
  altura_cm numeric(5,1),              -- sensor
  imc numeric(4,1),
  estado text,
  actualizado timestamptz
);

create table if not exists historial (  -- seguimiento mensual
  id serial primary key,
  estudiante_id int references estudiantes(id) on delete cascade,
  peso numeric(5,2), altura_cm numeric(5,1), imc numeric(4,1), estado text,
  fecha timestamptz default now()
);

create table if not exists dietas (
  id serial primary key,
  estado text unique not null,
  titulo text not null,
  recomendaciones text not null         -- una recomendación por línea
);

create table if not exists solicitudes (  -- comunicación web <-> ESP32
  id serial primary key,
  estado text not null default 'pendiente', -- pendiente|midiendo|listo|error
  altura_cm numeric(5,1),
  creado timestamptz default now()
);

insert into grados(nombre) values
('Transición'),('1°'),('2°'),('3°'),('4°'),('5°'),('6°'),('7°'),('8°'),('9°'),('10°'),('11°')
on conflict do nothing;

insert into dietas(estado,titulo,recomendaciones) values
('Bajo peso','Plan para ganar peso saludable',
E'Haz 5 comidas al día: desayuno, media mañana, almuerzo, merienda y cena.\nIncluye proteínas en cada comida: huevo, pollo, pescado, legumbres, lácteos.\nAgrega grasas saludables: aguacate, frutos secos, aceite de oliva.\nPrefiere carbohidratos complejos: arroz integral, avena, papa, plátano.\nConsulta a un nutricionista para un plan personalizado.'),
('Peso normal','Plan para mantener tu peso saludable',
E'Mantén un plato equilibrado: mitad verduras y frutas, un cuarto proteína, un cuarto cereales.\nBebe agua durante el día y limita las gaseosas.\nHaz al menos 60 minutos de actividad física diaria.\nDuerme entre 8 y 10 horas.\nEvita el exceso de fritos, dulces y comida empaquetada.'),
('Sobrepeso','Plan para equilibrar tu peso',
E'Aumenta verduras y frutas en cada comida.\nReduce gaseosas, jugos azucarados, fritos y paquetes.\nCome despacio y en porciones moderadas; no te saltes el desayuno.\nHaz actividad física todos los días (caminar, correr, deporte).\nLimita pantallas a máximo 2 horas diarias.\nConsulta a un nutricionista para un plan personalizado.'),
('Obesidad','Plan de acompañamiento nutricional',
E'Prioriza verduras, frutas, legumbres y proteínas magras.\nElimina bebidas azucaradas y reduce harinas refinadas y fritos.\nHaz 5 comidas pequeñas al día; evita comer por ansiedad.\nIncrementa la actividad física de forma gradual y con supervisión.\nAgenda una consulta con médico y nutricionista para un seguimiento personalizado.')
on conflict do nothing;
