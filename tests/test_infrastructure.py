"""
Test de Infraestructura - PASO 1

Verifica que MongoDB y Redis están funcionando correctamente.
"""

import os

import pytest
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as aioredis

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


@pytest.mark.asyncio
async def test_mongodb_connection():
    """Verificar conexión a MongoDB"""
    print("\n🧪 Testing MongoDB connection...")

    client = AsyncIOMotorClient(MONGODB_URI)

    try:
        # Ping al servidor
        await client.admin.command('ping')
        print("✅ MongoDB: Conexión exitosa")

        # Verificar que podemos crear una base de datos de prueba
        db = client.test_db
        result = await db.test_collection.insert_one({"test": "data"})
        assert result.inserted_id is not None
        print(f"✅ MongoDB: Insert exitoso (ID: {result.inserted_id})")

        # Limpiar
        await db.test_collection.delete_one({"_id": result.inserted_id})
        print("✅ MongoDB: Cleanup exitoso")

    finally:
        client.close()


@pytest.mark.asyncio
async def test_redis_connection():
    """Verificar conexión a Redis"""
    print("\n🧪 Testing Redis connection...")

    r = await aioredis.from_url(REDIS_URL)

    try:
        # Ping al servidor
        pong = await r.ping()
        assert pong is True
        print("✅ Redis: Ping exitoso")

        # Verificar que podemos escribir y leer
        await r.set("test_key", "test_value")
        value = await r.get("test_key")
        assert value.decode() == "test_value"
        print(f"✅ Redis: Set/Get exitoso (value: {value.decode()})")

        # Limpiar
        await r.delete("test_key")
        print("✅ Redis: Cleanup exitoso")

    finally:
        await r.close()


@pytest.mark.asyncio
async def test_mongodb_operations():
    """Verificar operaciones básicas de MongoDB"""
    print("\n🧪 Testing MongoDB operations...")

    client = AsyncIOMotorClient(MONGODB_URI)

    try:
        db = client.whatsapp_test

        # Create
        doc = {"name": "test_user", "message": "Hello World", "timestamp": "2024-01-01"}
        result = await db.messages.insert_one(doc)
        print(f"✅ MongoDB: Create OK (ID: {result.inserted_id})")

        # Read
        found = await db.messages.find_one({"_id": result.inserted_id})
        assert found["name"] == "test_user"
        print("✅ MongoDB: Read OK")

        # Update
        await db.messages.update_one(
            {"_id": result.inserted_id},
            {"$set": {"message": "Updated"}}
        )
        updated = await db.messages.find_one({"_id": result.inserted_id})
        assert updated["message"] == "Updated"
        print("✅ MongoDB: Update OK")

        # Delete
        delete_result = await db.messages.delete_one({"_id": result.inserted_id})
        assert delete_result.deleted_count == 1
        print("✅ MongoDB: Delete OK")

    finally:
        # Limpiar collection de prueba
        await db.messages.drop()
        client.close()


@pytest.mark.asyncio
async def test_redis_operations():
    """Verificar operaciones básicas de Redis"""
    print("\n🧪 Testing Redis operations...")

    r = await aioredis.from_url(REDIS_URL)

    try:
        # String operations
        await r.set("key1", "value1")
        value = await r.get("key1")
        assert value.decode() == "value1"
        print("✅ Redis: String operations OK")

        # Expiration
        await r.setex("temp_key", 5, "temp_value")
        ttl = await r.ttl("temp_key")
        assert 0 < ttl <= 5
        print(f"✅ Redis: TTL OK (ttl: {ttl}s)")

        # Hash operations
        await r.hset("user:1", mapping={"name": "John", "age": "30"})
        name = await r.hget("user:1", "name")
        assert name.decode() == "John"
        print("✅ Redis: Hash operations OK")

        # Cleanup
        await r.delete("key1", "temp_key", "user:1")
        print("✅ Redis: Cleanup OK")

    finally:
        await r.close()


if __name__ == "__main__":
    # Para ejecutar manualmente
    import asyncio

    async def main():
        print("\n" + "="*50)
        print("PRUEBA DE INFRAESTRUCTURA - PASO 1")
        print("="*50)

        await test_mongodb_connection()
        await test_redis_connection()
        await test_mongodb_operations()
        await test_redis_operations()

        print("\n" + "="*50)
        print("✅ TODOS LOS TESTS PASARON")
        print("="*50)

    asyncio.run(main())
