
import {
  EmbedBuilder,
  Guild,
  TextChannel,
  PermissionsBitField,
} from 'discord.js';

import { getSettings } from './db.js';

export function makeEmbed(
  guild: Guild,
  title: string,
  description: string,
  actor?: string,
  serverName?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle(title)
    .setDescription(description)
    .addFields({
      name: 'Sunucu',
      value: serverName || guild.name,
      inline: true,
    })
    .setTimestamp()
    .setFooter({
      text: 'Vexon Logs',
    });

  if (actor) {
    embed.addFields({
      name: 'İşlemi Yapan',
      value: actor,
      inline: true,
    });
  }

  if (guild.client.user) {
    embed.setFooter({
      text: 'Vexon Logs',
      iconURL: guild.client.user.displayAvatarURL(),
    });
  }

  return embed;
}

// Eski kullanım: sendLog(guild, embed)
export function sendLog(
  guild: Guild,
  embed: EmbedBuilder
): Promise<void>;

// Kullanım: sendLog(guild, title, description, actor?)
export function sendLog(
  guild: Guild,
  title: string,
  description: string,
  actor?: string
): Promise<void>;

// Kullanım: sendLog(guild, serverName, title, description, actor?)
export function sendLog(
  guild: Guild,
  serverName: string,
  title: string,
  description: string,
  actor?: string
): Promise<void>;

export async function sendLog(
  guild: Guild,
  second: EmbedBuilder | string,
  third?: string,
  fourth?: string,
  fifth?: string
): Promise<void> {
  const settings = getSettings(guild.id);

  if (!settings.enabled || !settings.logChannelId) {
    return;
  }

  let embed: EmbedBuilder;

  if (second instanceof EmbedBuilder) {
    embed = second;
  } else if (fifth !== undefined) {
    embed = makeEmbed(
      guild,
      third || 'Log Kaydı',
      fourth || '',
      fifth,
      second
    );
  } else {
    embed = makeEmbed(
      guild,
      second,
      third || '',
      fourth
    );
  }

  const channel = await guild.channels
    .fetch(settings.logChannelId)
    .catch(() => null);

  if (
    !channel ||
    channel.type !== 0
  ) {
    return;
  }

  const textChannel = channel as TextChannel;
  const botMember = guild.members.me;

  if (!botMember) {
    return;
  }

  const permissions =
    textChannel.permissionsFor(botMember);

  if (
    !permissions?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
    ])
  ) {
    return;
  }

  try {
    await textChannel.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error(
      'Vexon Logs: Log gönderilemedi.',
      error
    );
  }
}
