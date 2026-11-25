
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';

import {
  getSettings,
  setEnabled,
  setLogChannel,
} from './db.js';

import { makeEmbed } from './logging.js';

export const commands = [
  // Log kanalını ayarla
  new SlashCommandBuilder()
    .setName('log-ayarla')
    .setDescription('Vexon Logs kayıt kanalını ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('kanal')
        .setDescription('Logların gönderileceği kanal.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  // Test logu gönder
  new SlashCommandBuilder()
    .setName('log-test')
    .setDescription('Log kanalına test kaydı gönderir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Log sisteminin durumunu göster
  new SlashCommandBuilder()
    .setName('log-durum')
    .setDescription('Log sisteminin ayarlarını gösterir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Log sistemini aç
  new SlashCommandBuilder()
    .setName('log-aç')
    .setDescription('Sunucudaki log sistemini açar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Log sistemini kapat
  new SlashCommandBuilder()
    .setName('log-kapat')
    .setDescription('Sunucudaki log sistemini kapatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

export async function handleCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'Bu komut yalnızca sunucularda kullanılabilir.',
      ephemeral: true,
    });
    return;
  }

  if (
    !interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    )
  ) {
    await interaction.reply({
      content:
        'Bu komutu kullanmak için **Sunucuyu Yönet** yetkisi gerekir.',
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  const commandName = interaction.commandName;

  // LOG AYARLA
  if (commandName === 'log-ayarla') {
    const channel = interaction.options.getChannel(
      'kanal',
      true
    );

    if (
      channel.type !== ChannelType.GuildText
    ) {
      await interaction.reply({
        content: 'Lütfen geçerli bir yazı kanalı seç.',
        ephemeral: true,
      });
      return;
    }

    setLogChannel(guild.id, channel.id);

    await interaction.reply({
      content: `Log kanalı <#${channel.id}> olarak ayarlandı.`,
      ephemeral: true,
    });

    return;
  }

  // LOG AÇ / KAPAT
  if (
    commandName === 'log-aç' ||
    commandName === 'log-kapat'
  ) {
    const enabled = commandName === 'log-aç';

    setEnabled(guild.id, enabled);

    await interaction.reply({
      content: `Log sistemi **${enabled ? 'açıldı' : 'kapatıldı'}**.`,
      ephemeral: true,
    });

    return;
  }

  // LOG DURUM
  if (commandName === 'log-durum') {
    const settings = getSettings(guild.id);

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle('Vexon Logs • Sistem Durumu')
      .addFields(
        {
          name: 'Sistem',
          value: settings.enabled
            ? '🟢 Açık'
            : '🔴 Kapalı',
          inline: true,
        },
        {
          name: 'Log Kanalı',
          value: settings.logChannelId
            ? `<#${settings.logChannelId}>`
            : 'Ayarlanmamış',
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });

    return;
  }

  // LOG TEST
  if (commandName === 'log-test') {
    const settings = getSettings(guild.id);

    if (!settings.logChannelId) {
      await interaction.reply({
        content:
          'Önce `/log-ayarla` komutuyla log kanalını belirle.',
        ephemeral: true,
      });
      return;
    }

    const channel = await guild.channels
      .fetch(settings.logChannelId)
      .catch(() => null);

    if (
      !channel ||
      !channel.isTextBased() ||
      !('send' in channel)
    ) {
      await interaction.reply({
        content:
          'Log kanalı bulunamadı veya mesaj gönderilemiyor. Kanalı yeniden ayarla.',
        ephemeral: true,
      });
      return;
    }

    try {
      await channel.send({
        embeds: [
          makeEmbed(
            guild,
            '🧪 Test Kaydı',
            'Vexon Logs log sistemi başarıyla çalışıyor.',
            interaction.user.tag
          ),
        ],
      });

      await interaction.reply({
        content: 'Test kaydı log kanalına gönderildi.',
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content:
          'Log kanalına mesaj gönderilemedi. Botun kanal izinlerini kontrol et.',
        ephemeral: true,
      });
    }

    return;
  }
}
