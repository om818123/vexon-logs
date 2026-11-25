
import 'dotenv/config';

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Eksik ortam değişkeni: ${name}. .env dosyasını kontrol et.`
    );
  }

  return value;
}

export const config = {
  token: getRequiredEnv('DISCORD_TOKEN'),
  clientId: getRequiredEnv('CLIENT_ID'),
  guildId: process.env.GUILD_ID || '',
};
