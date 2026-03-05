#!/bin/bash
set -e

echo "🔧 Начинаем инициализацию базы данных..."

# Подключаемся к базе и создаем таблицы
PGPASSWORD="P@rs3r_S3cR3t!" psql -h db -U root -d auto_db <<EOF
-- Таблица car_listings
CREATE TABLE IF NOT EXISTS car_listings (
    id SERIAL PRIMARY KEY,
    short_url TEXT UNIQUE NOT NULL,
    title TEXT DEFAULT 'Неизвестно',
    make TEXT DEFAULT 'Неизвестно',
    model TEXT DEFAULT 'Неизвестно',
    year TEXT DEFAULT 'Неизвестно',
    body_type TEXT DEFAULT 'Неизвестно',
    horsepower TEXT DEFAULT 'Неизвестно',
    fuel_type TEXT DEFAULT 'Неизвестно',
    motors_trim TEXT DEFAULT 'Неизвестно',
    kilometers INT DEFAULT 0,
    price_formatted TEXT DEFAULT '0',
    price_raw NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'Неизвестно',
    exterior_color TEXT DEFAULT 'Неизвестно',
    location TEXT DEFAULT 'Неизвестно',
    phone TEXT DEFAULT 'Не указан',
    seller_name TEXT DEFAULT 'Неизвестен',
    seller_type TEXT DEFAULT 'Неизвестен',
    seller_logo TEXT,
    seller_profile_link TEXT,
    main_image TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица car_photos
CREATE TABLE IF NOT EXISTS car_photos (
    id SERIAL PRIMARY KEY,
    listing_id INT REFERENCES car_listings(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    UNIQUE(listing_id, photo_url)
);

-- Таблица users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    first_name TEXT,
    last_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_car_listings_short_url ON car_listings(short_url);
CREATE INDEX IF NOT EXISTS idx_car_listings_make ON car_listings(make);
CREATE INDEX IF NOT EXISTS idx_car_listings_model ON car_listings(model);
CREATE INDEX IF NOT EXISTS idx_car_listings_year ON car_listings(year);
CREATE INDEX IF NOT EXISTS idx_car_listings_price_raw ON car_listings(price_raw);
CREATE INDEX IF NOT EXISTS idx_car_listings_created_at ON car_listings(created_at);
CREATE INDEX IF NOT EXISTS idx_car_photos_listing_id ON car_photos(listing_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Создание триггера для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
 RETURNS TRIGGER AS $$
 BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
 END;
 $$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Создание пользователя admin
INSERT INTO users (email, password, role)
VALUES ('admin@test.com', 'admin123', 'admin')
ON CONFLICT (email) DO NOTHING;

EOF

echo "✅ База данных успешно инициализирована!"
