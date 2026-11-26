
import {
  AuditLogEvent,
  EmbedBuilder,
  Guild,
  GuildChannel,
  Message,
  VoiceState,
  TextChannel,
  PermissionsBitField,
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
    .setDescription(description.slice(0, 4000))
    .addFields({
      name: 'Sunucu',
      value: guild.name.slice(0, 100),
      inline: true,
    })
    .setTimestamp()
    .setFooter({ text: 'Vexon Logs' });

  if (actor) {
    embed.addFields({
      name: 'İşlemi Yapan',
      value: actor.slice(0, 1000),
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

export async function sendLog(
  guild: Guild,
  title: string,
  description: string,
  actor?: string
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
  const botMember = guild.members.me;

  if (!botMember) return;

  const permissions = textChannel.permissionsFor(botMember);

  if (
    !permissions?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
    ])
  ) {
    return;
  }

  const embed = makeEmbed(guild, title, description, actor);

  try {
    await textChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Vexon Logs: Log gönderilemedi.', error);
  }
}

export async function auditActor(
  guild: Guild,
  action: AuditLogEvent,
  targetId: string
): Promise<string | undefined> {
  try {
    const logs = await guild.fetchAuditLogs({
      type: action,
      limit: 6,
    });

    const entry = logs.entries.find(item =>
      item.target?.id === targetId &&
      Date.now() - item.createdTimestamp < 15000
    );

    if (!entry?.executor) return undefined;

    return `${entry.executor.tag} (${entry.executor.id})`;
  } catch {
    return undefined;
  }
}

export function channelLabel(channel: GuildChannel): string {
  return `${channel.name} (${channel.id})`;
}

export function messageDescription(message: Message): string {
  const content = message.content || 'Mesaj içeriği alınamadı';

  const attachmentList = message.attachments
    .map(attachment => attachment.url)
    .join('\n');

  const attachmentText = attachmentList
    ? `\n**Ekler:**\n${attachmentList}`
    : '';

  return `${content}${attachmentText}`.slice(0, 1500);
}

export function voiceStateDescription(
  oldState: VoiceState,
  newState: VoiceState
): string | undefined {
  const member = newState.member ?? oldState.member;
  const user = member?.user;

  if (!user) return undefined;

  const userText = `${user.tag} (<@${user.id}>)`;

  if (oldState.channelId !== newState.channelId) {
    if (!oldState.channelId && newState.channelId) {
      return `**Üye:** ${userText}
**İşlem:** Ses kanalına katıldı
**Kanal:** ${newState.channel}`;
    }

    if (oldState.channelId && !newState.channelId) {
      return `**Üye:** ${userText}
**İşlem:** Ses kanalından ayrıldı
**Önceki kanal:** ${oldState.channel}`;
    }

    return `**Üye:** ${userText}
**İşlem:** Ses kanalını değiştirdi
**Önce:** ${oldState.channel}
**Sonra:** ${newState.channel}`;
  }

  const changes: string[] = [];

  if (oldState.selfMute !== newState.selfMute) {
    changes.push(
      newState.selfMute ? 'Mikrofonunu kapattı' : 'Mikrofonunu açtı'
    );
  }

  if (oldState.selfDeaf !== newState.selfDeaf) {
    changes.push(
      newState.selfDeaf ? 'Kendi sesini kapattı' : 'Kendi sesini açtı'
    );
  }

  if (oldState.serverMute !== newState.serverMute) {
    changes.push(
      newState.serverMute
        ? 'Sunucu tarafından susturuldu'
        : 'Sunucu susturması kaldırıldı'
    );
  }

  if (oldState.serverDeaf !== newState.serverDeaf) {
    changes.push(
      newState.serverDeaf
        ? 'Sunucu tarafından sağırlaştırıldı'
        : 'Sunucu sağırlaştırması kaldırıldı'
    );
  }

  if (oldState.selfVideo !== newState.selfVideo) {
    changes.push(
      newState.selfVideo ? 'Kamerasını açtı' : 'Kamerasını kapattı'
    );
  }

  if (oldState.streaming !== newState.streaming) {
    changes.push(
      newState.streaming ? 'Yayın başlattı' : 'Yayını bitirdi'
    );
  }

  if (changes.length === 0) return undefined;

  return `**Üye:** ${userText}
**İşlem:** ${changes.join(', ')}`;
}
