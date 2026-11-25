
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands.js';

const rest = new REST({ version: '10' }).setToken(
  config.token
);

async function deployCommands(): Promise<void> {
  try {
    console.log('Vexon Logs komutları yükleniyor...');

    await rest.put(
      Routes.applicationGuildCommands(
        config.clientId,
        config.guildId
      ),
      {
        body: commands.map(command => command.toJSON()),
      }
    );

    console.log(
      'Slash komutları başarıyla yüklendi!'
    );
  } catch (error) {
    console.error(
      'Slash komutları yüklenirken hata oluştu:',
      error
    );
  }
}

deployCommands();
