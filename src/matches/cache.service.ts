import { Injectable, Logger } from '@nestjs/common'

interface CacheItem<T> {
  value: T
  expiresAt: number
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)
  private cache: Map<string, CacheItem<any>> = new Map()

  /**
   * Obtiene un valor de la caché
   * @param key Clave de la caché
   * @returns Valor almacenado o null si no existe o expiró
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) {
      return null
    }

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return item.value as T
  }

  /**
   * Almacena un valor en la caché
   * @param key Clave de la caché
   * @param value Valor a almacenar
   * @param ttlSeconds Tiempo de vida en segundos
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  /**
   * Elimina una clave de la caché
   * @param key Clave a eliminar
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Limpia toda la caché
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Limpia las claves expiradas
   */
  cleanExpired(): void {
    const now = Date.now()

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}
