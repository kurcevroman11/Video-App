export interface DatabaseConfig {
  user: string
  password: string
  host: string
  port: number
  name: string
}

export interface JwtConfig {
  secret: string
  accessTokenExpiresIn: string
  refreshTokenExpiresIn: string
}
