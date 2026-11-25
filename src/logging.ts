
import {
  EmbedBuilder,
  Guild,
  TextChannel,
} from 'discord.js';

import { getSettings } from './db.js';

export function makeEmbed(
  guild: Guild,
  title: string,
  description: string,
  actor?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle(title)
    .setDescription(description)
    .addFields({
      name: 'Sunucu',
      value: guild.name,
      inline: true,
    })
    .setTimestamp();

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
  } else {
    embed.setFooter({
      text: 'Vexon Logs',
    });
  }

  return embed;
}

export async function sendLog(
  guild: Guild,
  embed: EmbedBuilder
): Promise<void> {
  const settings = getSettings(guild.id);

  if (!settings.enabled || !settings.logChannelId) {
    return;
  }

  const channel = await guild.channels
    .fetch(settings.logChannelId)
    .catch(() => null);

  if (!channel || channel.type !== 0) {
    return;
  }

  const textChannel = channel as TextChannel;

  if (!textChannel.permissionsFor(guild.members.me!)?.has([
    'ViewChannel',
    'SendMessages',
    'EmbedLinks',
  ])) {
    return;
  }

  try {
    await textChannel.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Log gönderilemedi:', error);
  }
}
