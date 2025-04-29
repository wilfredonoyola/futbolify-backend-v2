import { Injectable, Logger } from '@nestjs/common'

interface CacheItem<T> {
  value: T
  expiry: number
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)
  private cache: Map<string, CacheItem<any>> = new Map()

  /**
   * Obtiene un valor de la caché
   * @param key Clave para el valor
   * @returns El valor almacenado o null si no existe o ha expirado
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) {
      return null
    }

    // Verificar si el ítem ha expirado
    if (item.expiry < Date.now()) {
      this.logger.debug(`Caché expirada para clave: ${key}`)
      this.cache.delete(key)
      return null
    }

    return item.value as T
  }

  /**
   * Almacena un valor en la caché
   * @param key Clave para el valor
   * @param value Valor a almacenar
   * @param ttlSeconds Tiempo de vida en segundos
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    const expiry = Date.now() + ttlSeconds * 1000
    this.cache.set(key, { value, expiry })
    this.logger.debug(
      `Valor almacenado en caché con clave: ${key}, TTL: ${ttlSeconds}s`
    )
  }

  /**
   * Elimina un valor de la caché
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
    this.logger.debug('Caché completamente limpiada')
  }

  /**
   * Limpia los ítems expirados de la caché
   */
  cleanExpired(): void {
    const now = Date.now()
    let count = 0

    for (const [key, item] of this.cache.entries()) {
      if (item.expiry < now) {
        this.cache.delete(key)
        count++
      }
    }

    if (count > 0) {
      this.logger.debug(`Eliminados ${count} ítems expirados de la caché`)
    }
  }
}
