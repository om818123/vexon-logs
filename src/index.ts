
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  Message,
  GuildChannel,
  VoiceState,
} from 'discord.js';

import { config } from './config.js';
import { handleCommand } from './commands.js';

import {
  sendLog,
  auditActor,
  channelLabel,
  messageDescription,
  voiceStateDescription,
} from './logging.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
  ],
});

// BOT HAZIR
client.once(Events.ClientReady, ready => {
  console.log(`Vexon Logs hazır: ${ready.user.tag}`);
  console.log(`${ready.guilds.cache.size} sunucuda çalışıyor.`);
});

// SLASH KOMUTLARI
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleCommand(interaction);
  } catch (error) {
    console.error('Komut hatası:', error);

    const replyText =
      'Komut çalıştırılırken hata oluştu. Bot izinlerini kontrol et.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: replyText,
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: replyText,
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

// MESAJ SİLİNDİ
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    '🗑️ Mesaj silindi',
    `**Yazar:** ${message.author?.tag ?? 'Bilinmiyor'}
**Kanal:** ${message.channel}
**İçerik:** ${messageDescription(message as Message)}
**Mesaj ID:** ${message.id}`
  );
});

// MESAJ DÜZENLENDİ
client.on(Events.MessageUpdate, async (before, after) => {
  if (!after.guild || after.author?.bot) return;

  const oldMessage = before as Message;
  const newMessage = after as Message;

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    after.guild,
    '✏️ Mesaj düzenlendi',
    `**Yazar:** ${after.author?.tag ?? 'Bilinmiyor'}
**Kanal:** ${after.channel}
**Önce:** ${messageDescription(oldMessage)}
**Sonra:** ${messageDescription(newMessage)}
**Mesaj:** https://discord.com/channels/${after.guild.id}/${after.channelId}/${after.id}`
  );
});

// TOPLU MESAJ SİLİNDİ
client.on(Events.MessageBulkDelete, async messages => {
  const first = messages.first();

  if (!first?.guild) return;

  await sendLog(
    first.guild,
    '🧹 Toplu mesaj silindi',
    `**Kanal:** ${first.channel}
**Silinen mesaj sayısı:** ${messages.size}`
  );
});

// ÜYE KATILDI
client.on(Events.GuildMemberAdd, async member => {
  await sendLog(
    member.guild,
    '📥 Üye sunucuya katıldı',
    `**Üye:** ${member.user.tag} (<@${member.id}>)
**Hesap oluşturulma:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`
  );
});

// ÜYE AYRILDI / KICK
client.on(Events.GuildMemberRemove, async member => {
  const actor = await auditActor(
    member.guild,
    AuditLogEvent.MemberKick,
    member.id
  );

  const wasKicked = Boolean(actor);

  await sendLog(
    member.guild,
    wasKicked
      ? '👢 Üye kicklendi'
      : '📤 Üye sunucudan ayrıldı',
    `**Üye:** ${member.user?.tag ?? member.id}
**Üye ID:** ${member.id}`,
    actor
  );
});

// ÜYE BANLANDI
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

// BAN KALDIRILDI
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

// ÜYE GÜNCELLENDİ
client.on(Events.GuildMemberUpdate, async (oldMember, member) => {
  // Takma ad
  if (oldMember.nickname !== member.nickname) {
    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '📝 Takma ad değişti',
      `**Üye:** ${member.user.tag}
**Önce:** ${oldMember.nickname ?? 'Yok'}
**Sonra:** ${member.nickname ?? 'Yok'}`,
      actor
    );
  }

  // Timeout
  if (
    oldMember.communicationDisabledUntilTimestamp !==
    member.communicationDisabledUntilTimestamp
  ) {
    const active =
      member.communicationDisabledUntilTimestamp !== null;

    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      active
        ? '⏳ Üyeye timeout uygulandı'
        : '✅ Timeout kaldırıldı',
      `**Üye:** ${member.user.tag}
**Bitiş:** ${
        member.communicationDisabledUntilTimestamp
          ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>`
          : 'Yok'
      }`,
      actor
    );
  }

  // Rol değişiklikleri
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(member.roles.cache.keys());

  const added = [...newRoles].filter(
    id => !oldRoles.has(id) && id !== member.guild.id
  );

  const removed = [...oldRoles].filter(
    id => !newRoles.has(id) && id !== member.guild.id
  );

  for (const roleId of added) {
    const role = member.guild.roles.cache.get(roleId);

    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberRoleUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '➕ Üyeye rol verildi',
      `**Üye:** ${member.user.tag}
**Rol:** ${role?.name ?? roleId}`,
      actor
    );
  }

  for (const roleId of removed) {
    const role = member.guild.roles.cache.get(roleId);

    const actor = await auditActor(
      member.guild,
      AuditLogEvent.MemberRoleUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '➖ Üyeden rol alındı',
      `**Üye:** ${member.user.tag}
**Rol:** ${role?.name ?? roleId}`,
      actor
    );
  }
});

// KANAL OLUŞTURULDU
client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;

  const actor = await auditActor(
    channel.guild,
    AuditLogEvent.ChannelCreate,
    channel.id
  );

  await sendLog(
    channel.guild,
    '📁 Kanal oluşturuldu',
    `**Kanal:** ${channel.name} (${channel.id})`,
    actor
  );
});

// KANAL SİLİNDİ
client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;

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

// KANAL ADI / İZİNLERİ DEĞİŞTİ
client.on(Events.ChannelUpdate, async (oldChannel, channel) => {
  if (!channel.guild) return;

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
    'permissionOverwrites' in oldChannel &&
    'permissionOverwrites' in channel
  ) {
    const oldGuildChannel = oldChannel as GuildChannel;
    const newGuildChannel = channel as GuildChannel;

    const oldData = oldGuildChannel.permissionOverwrites.cache
      .map(overwrite => ({
        id: overwrite.id,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const newData = newGuildChannel.permissionOverwrites.cache
      .map(overwrite => ({
        id: overwrite.id,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
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
  }
});

// SES DURUMU
client.on(
  Events.VoiceStateUpdate,
  async (oldState: VoiceState, newState: VoiceState) => {
    const description = voiceStateDescription(
      oldState,
      newState
    );

    if (!description) return;

    await sendLog(
      newState.guild,
      '🔊 Ses durumu değişti',
      description
    );
  }
);

// HATA YÖNETİMİ
client.on('error', error => {
  console.error('Discord istemci hatası:', error);
});

process.on('unhandledRejection', reason => {
  console.error('Yakalanmamış hata:', reason);
});

// BOTU BAŞLAT
client.login(config.token).catch(error => {
  console.error('Bot Discord’a giriş yapamadı:', error);
  process.exit(1);
});
