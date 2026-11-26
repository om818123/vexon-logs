
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

// TOKENİ KODUN İÇİNE YAZMA
// Railway Variables bölümüne DISCORD_TOKEN ekle.
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('DISCORD_TOKEN bulunamadı!');
  process.exit(1);
}

const SETTINGS_FILE = path.join(__dirname, 'vexon-settings.json');

let settings = {};

try {
  if (fs.existsSync(SETTINGS_FILE)) {
    settings = JSON.parse(
      fs.readFileSync(SETTINGS_FILE, 'utf8')
    );
  }
} catch (error) {
  console.error('Ayar dosyası okunamadı:', error);
}

// AYARLARI KAYDET
function saveSettings() {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(settings, null, 2),
    'utf8'
  );
}

// LOG EMBED
function createEmbed(guild, title, description, actor) {
  const embed = new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle(title)
    .setDescription(
      String(description || 'Açıklama yok').slice(0, 4000)
    )
    .addFields({
      name: 'Sunucu',
      value: guild.name.slice(0, 100),
      inline: true
    })
    .setTimestamp()
    .setFooter({
      text: 'Vexon Logs'
    });

  if (actor) {
    embed.addFields({
      name: 'İşlemi yapan',
      value: String(actor).slice(0, 1000),
      inline: true
    });
  }

  return embed;
}

// LOG GÖNDER
async function sendLog(guild, title, description, actor) {
  const channelId = settings[guild.id]?.channelId;

  if (!channelId) return;

  const channel = await guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (
    !channel ||
    !channel.isTextBased() ||
    !channel.send
  ) {
    return;
  }

  const botMember = guild.members.me;

  if (!botMember) return;

  const permissions = channel.permissionsFor(botMember);

  if (
    !permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ])
  ) {
    return;
  }

  try {
    await channel.send({
      embeds: [
        createEmbed(guild, title, description, actor)
      ]
    });
  } catch (error) {
    console.error('Log gönderilemedi:', error.message);
  }
}

// AUDIT LOG İŞLEMİNİ YAPAN
async function getActor(guild, action, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: action,
      limit: 6
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

// MESAJ İÇERİĞİ
function getMessageContent(message) {
  const content = message.content || 'İçerik alınamadı';

  const attachments = [...message.attachments.values()]
    .map(file => file.url)
    .join('\n');

  return (
    content +
    (attachments ? `\nEkler:\n${attachments}` : '')
  ).slice(0, 1500);
}

// SLASH KOMUTLARI
const commands = [
  new SlashCommandBuilder()
    .setName('log-ayarla')
    .setDescription('Log kanalını ayarlar')
    .addChannelOption(option =>
      option
        .setName('kanal')
        .setDescription('Log kanalını seç')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName('log-test')
    .setDescription('Test logu gönderir')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName('log-durum')
    .setDescription('Log ayarını gösterir')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName('log-kapat')
    .setDescription('Log sistemini kapatır')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
].map(command => command.toJSON());

// DISCORD CLIENT
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

// BOT HAZIR
client.once(Events.ClientReady, async ready => {
  console.log(`Vexon Logs aktif: ${ready.user.tag}`);

  try {
    const rest = new REST({
      version: '10'
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(ready.user.id),
      {
        body: commands
      }
    );

    console.log('Slash komutları kaydedildi.');
  } catch (error) {
    console.error(
      'Slash komutları kaydedilemedi:',
      error.message
    );
  }
});

// SLASH KOMUTLARI
client.on(Events.InteractionCreate, async interaction => {
  if (
    !interaction.isChatInputCommand() ||
    !interaction.guild
  ) {
    return;
  }

  if (
    !interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    )
  ) {
    return interaction.reply({
      content: 'Bu komut için Sunucuyu Yönet yetkisi gerekiyor.',
      ephemeral: true
    });
  }

  const guild = interaction.guild;

  // LOG AYARLA
  if (interaction.commandName === 'log-ayarla') {
    const channel = interaction.options.getChannel(
      'kanal',
      true
    );

    settings[guild.id] = {
      channelId: channel.id
    };

    saveSettings();

    return interaction.reply({
      content: `Log kanalı ${channel} olarak ayarlandı.`,
      ephemeral: true
    });
  }

  // LOG TEST
  if (interaction.commandName === 'log-test') {
    if (!settings[guild.id]?.channelId) {
      return interaction.reply({
        content: 'Önce /log-ayarla komutunu kullan.',
        ephemeral: true
      });
    }

    await sendLog(
      guild,
      '🧪 Vexon Logs test',
      'Log sistemi çalışıyor.'
    );

    return interaction.reply({
      content: 'Test logu gönderildi.',
      ephemeral: true
    });
  }

  // LOG DURUM
  if (interaction.commandName === 'log-durum') {
    const channelId = settings[guild.id]?.channelId;

    return interaction.reply({
      content: channelId
        ? `Log kanalı: <#${channelId}>`
        : 'Log kanalı ayarlanmamış.',
      ephemeral: true
    });
  }

  // LOG KAPAT
  if (interaction.commandName === 'log-kapat') {
    delete settings[guild.id];

    saveSettings();

    return interaction.reply({
      content: 'Log sistemi kapatıldı.',
      ephemeral: true
    });
  }
});

// MESAJ SİLİNDİ
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    '🗑️ Mesaj silindi',
    `Yazar: ${message.author?.tag || 'Bilinmiyor'}
Kanal: ${message.channel}
İçerik:
${getMessageContent(message)}
Mesaj ID: ${message.id}`
  );
});

// TOPLU MESAJ SİLİNDİ
client.on(Events.MessageBulkDelete, async messages => {
  const message = messages.first();

  if (!message?.guild) return;

  await sendLog(
    message.guild,
    '🧹 Toplu mesaj silindi',
    `Kanal: ${message.channel}
Silinen mesaj sayısı: ${messages.size}`
  );
});

// MESAJ DÜZENLENDİ
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (
    !newMessage.guild ||
    newMessage.author?.bot ||
    oldMessage.content === newMessage.content
  ) {
    return;
  }

  await sendLog(
    newMessage.guild,
    '✏️ Mesaj düzenlendi',
    `Yazar: ${newMessage.author?.tag || 'Bilinmiyor'}
Kanal: ${newMessage.channel}
Önce: ${getMessageContent(oldMessage)}
Sonra: ${getMessageContent(newMessage)}
https://discord.com/channels/${newMessage.guild.id}/${newMessage.channelId}/${newMessage.id}`
  );
});

// ÜYE KATILDI
client.on(Events.GuildMemberAdd, async member => {
  await sendLog(
    member.guild,
    '📥 Üye katıldı',
    `Üye: ${member.user.tag}
Hesap oluşturulma: <t:${Math.floor(
      member.user.createdTimestamp / 1000
    )}:F>`
  );
});

// ÜYE AYRILDI
client.on(Events.GuildMemberRemove, async member => {
  const actor = await getActor(
    member.guild,
    AuditLogEvent.MemberKick,
    member.id
  );

  await sendLog(
    member.guild,
    actor
      ? '👢 Üye kicklendi'
      : '📤 Üye sunucudan ayrıldı',
    `Üye: ${member.user?.tag || member.id}
Üye ID: ${member.id}`,
    actor
  );
});

// ÜYE BANLANDI
client.on(Events.GuildBanAdd, async ban => {
  const actor = await getActor(
    ban.guild,
    AuditLogEvent.MemberBanAdd,
    ban.user.id
  );

  await sendLog(
    ban.guild,
    '🔨 Üye banlandı',
    `Üye: ${ban.user.tag}
Sebep: ${ban.reason || 'Belirtilmedi'}`,
    actor
  );
});

// BAN KALDIRILDI
client.on(Events.GuildBanRemove, async ban => {
  const actor = await getActor(
    ban.guild,
    AuditLogEvent.MemberBanRemove,
    ban.user.id
  );

  await sendLog(
    ban.guild,
    '♻️ Ban kaldırıldı',
    `Üye: ${ban.user.tag}`,
    actor
  );
});

// ÜYE GÜNCELLENDİ
client.on(Events.GuildMemberUpdate, async (oldMember, member) => {
  // TAKMA AD
  if (oldMember.nickname !== member.nickname) {
    const actor = await getActor(
      member.guild,
      AuditLogEvent.MemberUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '📝 Takma ad değişti',
      `Üye: ${member.user.tag}
Önce: ${oldMember.nickname || 'Yok'}
Sonra: ${member.nickname || 'Yok'}`,
      actor
    );
  }

  // TIMEOUT
  if (
    oldMember.communicationDisabledUntilTimestamp !==
    member.communicationDisabledUntilTimestamp
  ) {
    const active =
      member.communicationDisabledUntilTimestamp !== null;

    const actor = await getActor(
      member.guild,
      AuditLogEvent.MemberUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      active
        ? '⏳ Timeout uygulandı'
        : '✅ Timeout kaldırıldı',
      `Üye: ${member.user.tag}
Bitiş: ${
        member.communicationDisabledUntilTimestamp
          ? `<t:${Math.floor(
              member.communicationDisabledUntilTimestamp / 1000
            )}:F>`
          : 'Yok'
      }`,
      actor
    );
  }

  // ROL DEĞİŞİKLİKLERİ
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(member.roles.cache.keys());

  for (const roleId of newRoles) {
    if (
      roleId === member.guild.id ||
      oldRoles.has(roleId)
    ) {
      continue;
    }

    const role = member.guild.roles.cache.get(roleId);

    const actor = await getActor(
      member.guild,
      AuditLogEvent.MemberRoleUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '➕ Üyeye rol verildi',
      `Üye: ${member.user.tag}
Rol: ${role?.name || roleId}`,
      actor
    );
  }

  for (const roleId of oldRoles) {
    if (
      roleId === member.guild.id ||
      newRoles.has(roleId)
    ) {
      continue;
    }

    const role = member.guild.roles.cache.get(roleId);

    const actor = await getActor(
      member.guild,
      AuditLogEvent.MemberRoleUpdate,
      member.id
    );

    await sendLog(
      member.guild,
      '➖ Üyeden rol alındı',
      `Üye: ${member.user.tag}
Rol: ${role?.name || roleId}`,
      actor
    );
  }
});

// KANAL OLUŞTURULDU
client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;

  const actor = await getActor(
    channel.guild,
    AuditLogEvent.ChannelCreate,
    channel.id
  );

  await sendLog(
    channel.guild,
    '📁 Kanal oluşturuldu',
    `Kanal: ${channel.name} (${channel.id})`,
    actor
  );
});

// KANAL SİLİNDİ
client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;

  const actor = await getActor(
    channel.guild,
    AuditLogEvent.ChannelDelete,
    channel.id
  );

  await sendLog(
    channel.guild,
    '🗑️ Kanal silindi',
    `Kanal: ${channel.name} (${channel.id})`,
    actor
  );
});

// KANAL GÜNCELLENDİ
client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  // KANAL ADI
  if (
    'name' in oldChannel &&
    'name' in newChannel &&
    oldChannel.name !== newChannel.name
  ) {
    const actor = await getActor(
      newChannel.guild,
      AuditLogEvent.ChannelUpdate,
      newChannel.id
    );

    await sendLog(
      newChannel.guild,
      '✏️ Kanal adı değişti',
      `Önce: ${oldChannel.name}
Sonra: ${newChannel.name}
Kanal: <#${newChannel.id}>`,
      actor
    );
  }

  // KANAL İZİNLERİ
  if (
    'permissionOverwrites' in oldChannel &&
    'permissionOverwrites' in newChannel
  ) {
    const oldData = oldChannel.permissionOverwrites.cache
      .map(item =>
        `${item.id}:${item.allow.bitfield}:${item.deny.bitfield}`
      )
      .sort()
      .join('|');

    const newData = newChannel.permissionOverwrites.cache
      .map(item =>
        `${item.id}:${item.allow.bitfield}:${item.deny.bitfield}`
      )
      .sort()
      .join('|');

    if (oldData !== newData) {
      const actor = await getActor(
        newChannel.guild,
        AuditLogEvent.ChannelOverwriteUpdate,
        newChannel.id
      );

      await sendLog(
        newChannel.guild,
        '🔐 Kanal izinleri değişti',
        `Kanal: <#${newChannel.id}>
Kanal izinleri güncellendi.`,
        actor
      );
    }
  }
});

// SES DURUMU
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member || oldState.member;

  if (!member) return;

  let description = '';

  if (oldState.channelId !== newState.channelId) {
    if (!oldState.channelId && newState.channelId) {
      description = `Ses kanalına katıldı: ${newState.channel}`;
    } else if (
      oldState.channelId &&
      !newState.channelId
    ) {
      description = `Ses kanalından ayrıldı: ${oldState.channel}`;
    } else {
      description = `Ses kanalını değiştirdi:
Önce: ${oldState.channel}
Sonra: ${newState.channel}`;
    }
  } else {
    const changes = [];

    if (oldState.selfMute !== newState.selfMute) {
      changes.push(
        newState.selfMute
          ? 'Mikrofonunu kapattı'
          : 'Mikrofonunu açtı'
      );
    }

    if (oldState.selfDeaf !== newState.selfDeaf) {
      changes.push(
        newState.selfDeaf
          ? 'Kendi sesini kapattı'
          : 'Kendi sesini açtı'
      );
    }

    if (oldState.serverMute !== newState.serverMute) {
      changes.push(
        newState.serverMute
          ? 'Sunucuda susturuldu'
          : 'Sunucu susturması kaldırıldı'
      );
    }

    if (oldState.serverDeaf !== newState.serverDeaf) {
      changes.push(
        newState.serverDeaf
          ? 'Sunucuda sağırlaştırıldı'
          : 'Sunucu sağırlaştırması kaldırıldı'
      );
    }

    if (oldState.selfVideo !== newState.selfVideo) {
      changes.push(
        newState.selfVideo
          ? 'Kamerasını açtı'
          : 'Kamerasını kapattı'
      );
    }

    if (oldState.streaming !== newState.streaming) {
      changes.push(
        newState.streaming
          ? 'Yayın başlattı'
          : 'Yayını bitirdi'
      );
    }

    description = changes.join(', ');
  }

  if (!description) return;

  await sendLog(
    newState.guild,
    '🔊 Ses durumu değişti',
    `Üye: ${member.user.tag} (<@${member.id}>)
${description}`
  );
});

// HATA YÖNETİMİ
client.on('error', error => {
  console.error('Discord istemci hatası:', error);
});

process.on('unhandledRejection', error => {
  console.error('Yakalanmamış hata:', error);
});

// BOTU BAŞLAT
client.login(TOKEN).catch(error => {
  console.error('Bot giriş yapamadı:', error.message);
  process.exit(1);
});
