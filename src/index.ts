
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  Message,
  GuildMember,
  VoiceState,
  GuildChannel,
  PermissionFlagsBits,
  TextChannel
} from 'discord.js';

import { config } from './config.js';
import { handleCommand } from './commands.js';
import {
  sendLog,
  auditActor,
  channelLabel,
  messageDescription,
  voiceStateDescription
} from './logging.js';

import { getSettings } from './db.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User
  ]
});

// Bot hazır olduğunda
client.once(Events.ClientReady, ready => {
  console.log(`Vexon Logs hazır: ${ready.user.tag}`);
  console.log(`${ready.guilds.cache.size} sunucuda çalışıyor.`);
});

// Slash komutları
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleCommand(interaction);
  } catch (error) {
    console.error('Komut hatası:', error);

    const message =
      'Komut çalıştırılırken bir hata oluştu. Bot izinlerini ve log kanalını kontrol et.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: message,
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: message,
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// Mesaj silindi
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    '🗑️ Mesaj silindi',
    `**Yazar:** ${message.author?.tag ?? 'Bilinmiyor'} (<@${message.author?.id ?? '0'}>)
**Kanal:** ${message.channel}
**İçerik:** ${messageDescription(message as Message)}
**Mesaj ID:** ${message.id}`
  );
});

// Mesaj düzenlendi
client.on(Events.MessageUpdate, async (before, after) => {
  if (!after.guild || after.author?.bot) return;

  const oldMessage = before as Message;
  const newMessage = after as Message;

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    after.guild,
    '✏️ Mesaj düzenlendi',
    `**Yazar:** ${after.author?.tag ?? 'Bilinmiyor'} (<@${after.author?.id ?? '0'}>)
**Kanal:** ${after.channel}
**Önce:** ${messageDescription(oldMessage)}
**Sonra:** ${messageDescription(newMessage)}
**Mesaj:** https://discord.com/channels/${after.guild.id}/${after.channelId}/${after.id}`
  );
});

// Toplu mesaj silindi
client.on(Events.MessageBulkDelete, async messages => {
  const first = messages.first();

  if (!first?.guild) return;

  await sendLog(
    first.guild,
    '🧹 Toplu mesaj silindi',
    `**Kanal:** ${first.channel}
**Silinen mesaj sayısı:** ${messages.size}
**Not:** Discord bazı mesaj içeriklerini toplu silme olayında sağlamayabilir.`
  );
});

// Üye sunucuya katıldı
client.on(Events.GuildMemberAdd, async member => {
  await sendLog(
    member.guild,
    '📥 Üye sunucuya katıldı',
    `**Üye:** ${member.user.tag} (<@${member.id}>)
**Hesap oluşturulma:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`
  );
});

// Üye sunucudan ayrıldı / kick / ban
client.on(Events.GuildMemberRemove, async member => {
  const kickActor = await auditActor(
    member.guild,
    AuditLogEvent.MemberKick,
    member.id
  );

  const banActor = await auditActor(
    member.guild,
    AuditLogEvent.MemberBanAdd,
    member.id
  );

  const title = banActor
    ? '🔨 Üye banlandı'
    : kickActor
      ? '👢 Üye kicklendi'
      : '📤 Üye sunucudan ayrıldı';

  await sendLog(
    member.guild,
    title,
    `**Üye:** ${member.user?.tag ?? member.id} (<@${member.id}>)
**Üye ID:** ${member.id}`,
    banActor ?? kickActor
  );
});

// Üye banlandı
client.on(Events.GuildBanAdd, async ban => {
  const actor = await auditActor(
    ban.guild,
    AuditLogEvent.MemberBanAdd,
    ban.user.id
  );

  await sendLog(
    ban.guild,
    '🔨 Üye banlandı',
    `**Üye:** ${ban.user.tag} (<@${ban.user.id}>)
**Sebep:** ${ban.reason ?? 'Belirtilmedi'}`,
    actor
  );
});

// Ban kaldırıldı
client.on(Events.GuildBanRemove, async ban => {
  const actor = await auditActor(
    ban.guild,
    AuditLogEvent.MemberBanRemove,
    ban.user.id
  );

  await sendLog(
    ban.guild,
    '♻️ Üyenin banı kaldırıldı',
    `**Üye:** ${ban.user.tag} (<@${ban.user.id}>)`,
    actor
  );
});

// Üye güncellendi: takma ad, timeout, roller
client.on(Events.GuildMemberUpdate, async (oldMember, member) => {
  // Takma ad değişikliği
  if (oldMember.nickname !== member.nickname) {
    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '📝 Üye takma adı değişti',
      `**Üye:** ${member.user.tag} (<@${member.id}>)
**Önce:** ${oldMember.nickname ?? 'Yok'}
**Sonra:** ${member.nickname ?? 'Yok'}`,
      actor
    );
  }

  // Timeout değişikliği
  if (
    oldMember.communicationDisabledUntilTimestamp !==
    member.communicationDisabledUntilTimestamp
  ) {
    const timeoutActive = Boolean(
      member.communicationDisabledUntilTimestamp
    );

    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      timeoutActive
        ? '⏳ Üyeye timeout uygulandı'
        : '✅ Timeout kaldırıldı',
      `**Üye:** ${member.user.tag} (<@${member.id}>)
**Bitiş:** ${
        member.communicationDisabledUntil
          ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp! / 1000)}:F>`
          : 'Yok'
      }`,
      actor
    );
  }

  // Rol değişiklikleri
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(member.roles.cache.keys());

  const addedRoles = [...newRoles].filter(
    id => !oldRoles.has(id) && id !== member.guild.id
  );

  const removedRoles = [...oldRoles].filter(
    id => !newRoles.has(id) && id !== member.guild.id
  );

  for (const roleId of addedRoles) {
    const role = member.guild.roles.cache.get(roleId);

    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberRoleUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '➕ Üyeye rol verildi',
      `**Üye:** ${member.user.tag} (<@${member.id}>)
**Rol:** ${role?.name ?? roleId}`,
      actor
    );
  }

  for (const roleId of removedRoles) {
    const role = member.guild.roles.cache.get(roleId);

    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberRoleUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '➖ Üyeden rol alındı',
      `**Üye:** ${member.user.tag} (<@${member.id}>)
**Rol:** ${role?.name ?? roleId}`,
      actor
    );
  }
});

// Kanal oluşturuldu
client.on(Events.ChannelCreate, async channel => {
  if (channel.isDMBased() || !channel.guild) return;

  const actor = await auditActor(
    channel.guild,
    AuditLogEvent.ChannelCreate,
    channel.id
  );

  await sendLog(
    channel.guild,
    '📁 Kanal oluşturuldu',
    `**Kanal:** ${channelLabel(channel as GuildChannel)}`,
    actor
  );
});

// Kanal silindi
client.on(Events.ChannelDelete, async channel => {
  if (channel.isDMBased() || !channel.guild) return;

  const actor = await auditActor(
    channel.guild,
    AuditLogEvent.ChannelDelete,
    channel.id
  );

  await sendLog(
    channel.guild,
    '🗑️ Kanal silindi',
    `**Kanal:** ${channel.name} (${channel.id})`,
    actor
  );
});

// Kanal adı / izin değişikliği
client.on(Events.ChannelUpdate, async (oldChannel, channel) => {
  if (channel.isDMBased() || !channel.guild) return;

  if (
    'name' in oldChannel &&
    'name' in channel &&
    oldChannel.name !== channel.name
  ) {
    const actor = await auditActor(
      channel.guild,
      AuditLogEvent.ChannelUpdate,
      channel.id
    );

    await sendLog(
      channel.guild,
      '✏️ Kanal adı değiştirildi',
      `**Önce:** ${oldChannel.name}
**Sonra:** ${channel.name}
**Kanal:** <#${channel.id}>`,
      actor
    );
  }

  if (
    oldChannel instanceof GuildChannel &&
    channel instanceof GuildChannel &&
    !oldChannel.permissionOverwrites.cache.equals(
      channel.permissionOverwrites.cache
    )
  ) {
    const actor = await auditActor(
      channel.guild,
      AuditLogEvent.ChannelOverwriteUpdate,
      channel.id
    );

    await sendLog(
      channel.guild,
      '🔐 Kanal izinleri değişti',
      `**Kanal:** <#${channel.id}>
Kanal izinleri güncellendi.`,
      actor
    );
  }
});

// Ses durumu değişti
client.on(
  Events.VoiceStateUpdate,
  async (oldState: VoiceState, newState: VoiceState) => {
    const description = voiceStateDescription(
      oldState,
      newState
    );

    if (description) {
      await sendLog(
        newState.guild,
        '🔊 Ses durumu değişti',
        description
      );
    }
  }
);

// Hata yönetimi
client.on('error', error => {
  console.error('Discord istemci hatası:', error);
});

process.on('unhandledRejection', reason => {
  console.error('Yakalanmamış hata:', reason);
});

process.on('uncaughtException', error => {
  console.error('Beklenmeyen hata:', error);
});

// Botu Discord'a bağla
client.login(config.token).catch(error => {
  console.error(
    'Bot giriş yapamadı. Tokeni ve internet bağlantısını kontrol et.',
    error
  );

  process.exit(1);
});
