// WhatsApp Bot with 40+ commands - Pure Node.js
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const axios = require("axios")
const moment = require("moment")
const path = require("path")

// Ensure directories exist
const MEDIA_DIR = path.join(__dirname, "media")
const STATUS_DIR = path.join(__dirname, "status")
const CONFIG_FILE = path.join(__dirname, "config.json")

// Create directories if they don't exist
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR)
if (!fs.existsSync(STATUS_DIR)) fs.mkdirSync(STATUS_DIR)

// Initialize config
let config = {
  groups: {},
  users: {},
  settings: {
    prefix: ".",
    adminNumbers: [],
  },
}

// Load config if exists
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
  } catch (err) {
    console.error("Error loading config:", err)
  }
}

// Save config function
const saveConfig = () => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
})

// Generate QR code for authentication
client.on("qr", (qr) => {
  console.log("QR RECEIVED:")
  qrcode.generate(qr, { small: true })
  console.log("Scan this QR code with your WhatsApp to log in")
})

// Client ready event
client.on("ready", () => {
  console.log("Client is ready!")
})

// Message handler
client.on("message", async (message) => {
  try {
    // Check if message starts with prefix
    const prefix = config.settings.prefix
    if (!message.body.startsWith(prefix)) return

    // Parse command and arguments
    const args = message.body.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    // Get chat and sender info
    const chat = await message.getChat()
    const sender = await message.getContact()
    const isGroup = chat.isGroup

    // Check if user is admin
    const isAdmin = config.settings.adminNumbers.includes(sender.id.user)
    const isGroupAdmin = isGroup
      ? chat.participants.find((p) => p.id._serialized === sender.id._serialized)?.isAdmin
      : false

    // Initialize group in config if not exists
    if (isGroup && !config.groups[chat.id._serialized]) {
      config.groups[chat.id._serialized] = {
        muted: false,
        welcome: "Welcome to the group, @user!",
        goodbye: "Goodbye, @user!",
        rules: "No rules set yet.",
        antiLink: false,
        botEnabled: true,
      }
      saveConfig()
    }

    // Initialize user in config if not exists
    if (!config.users[sender.id.user]) {
      config.users[sender.id.user] = {
        warns: 0,
        banned: false,
        afk: false,
        afkReason: "",
        lastSeen: Date.now(),
      }
      saveConfig()
    }

    // Check if bot is enabled in the group
    if (isGroup && config.groups[chat.id._serialized].muted && !isAdmin && !isGroupAdmin) {
      return
    }

    // Check if user is banned
    if (config.users[sender.id.user].banned && !isAdmin) {
      return message.reply("You are banned from using the bot.")
    }

    // Update user's last seen
    config.users[sender.id.user].lastSeen = Date.now()

    // Handle AFK status
    if (config.users[sender.id.user].afk) {
      config.users[sender.id.user].afk = false
      config.users[sender.id.user].afkReason = ""
      message.reply("Your AFK status has been removed.")
    }

    // Handle commands
    switch (command) {
      // HELP COMMANDS
      case "help":
        const helpText = `*WhatsApp Bot Commands*
        
*General Commands:*
${prefix}help - Show this help message
${prefix}ping - Check bot latency
${prefix}info - Bot information
${prefix}afk [reason] - Set AFK status
${prefix}profile - View your profile

*Group Management:*
${prefix}tagall [message] - Tag all group members
${prefix}mute - Mute the bot in the group
${prefix}unmute - Unmute the bot in the group
${prefix}kick @user - Kick a user from the group
${prefix}add number - Add a user to the group
${prefix}promote @user - Promote a user to admin
${prefix}demote @user - Demote a user from admin
${prefix}welcome [message] - Set welcome message
${prefix}goodbye [message] - Set goodbye message
${prefix}rules [rules] - Set group rules
${prefix}antilink on/off - Toggle anti-link protection

*Media Commands:*
${prefix}sticker - Convert image/video to sticker
${prefix}savestatus - Save a status
${prefix}image [query] - Search for an image
${prefix}video [query] - Search for a video
${prefix}ytmp3 [url] - Download YouTube audio
${prefix}ytmp4 [url] - Download YouTube video

*Fun Commands:*
${prefix}joke - Get a random joke
${prefix}meme - Get a random meme
${prefix}quote - Get a random quote
${prefix}fact - Get a random fact
${prefix}8ball [question] - Ask the magic 8ball
${prefix}flip - Flip a coin
${prefix}roll - Roll a dice
${prefix}tts [text] - Convert text to speech

*Utility Commands:*
${prefix}weather [location] - Get weather information
${prefix}translate [lang] [text] - Translate text
${prefix}calculate [expression] - Calculate an expression
${prefix}shorturl [url] - Shorten a URL
${prefix}covid [country] - Get COVID-19 stats
${prefix}news - Get latest news
${prefix}dictionary [word] - Look up a word
${prefix}reminder [time] [text] - Set a reminder

*Admin Commands:*
${prefix}ban @user - Ban a user from using the bot
${prefix}unban @user - Unban a user
${prefix}warn @user - Warn a user
${prefix}unwarn @user - Remove a warning from a user
${prefix}setprefix [prefix] - Change command prefix
${prefix}broadcast [message] - Broadcast a message to all groups
${prefix}restart - Restart the bot
`
        message.reply(helpText)
        break

      // GROUP MANAGEMENT COMMANDS
      case "tagall":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")

        const mentions = []
        let mentionText = args.join(" ") || "Hey everyone!"
        mentionText += "\n\n"

        for (const participant of chat.participants) {
          const contact = await client.getContactById(participant.id._serialized)
          mentions.push(contact)
          mentionText += `@${participant.id.user} `
        }

        await chat.sendMessage(mentionText, { mentions })
        break

      case "mute":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")

        config.groups[chat.id._serialized].muted = true
        saveConfig()
        message.reply("Bot has been muted in this group.")
        break

      case "unmute":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")

        config.groups[chat.id._serialized].muted = false
        saveConfig()
        message.reply("Bot has been unmuted in this group.")
        break

      case "kick":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to kick.")

        const kickUser = message.mentions[0]
        await chat.removeParticipants([kickUser])
        message.reply(`User ${kickUser.pushname || "User"} has been kicked.`)
        break

      case "add":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")
        if (args.length === 0) return message.reply("Please provide a number to add.")

        const number = args[0].replace(/[^0-9]/g, "") + "@c.us"
        try {
          await chat.addParticipants([number])
          message.reply("User added successfully.")
        } catch (err) {
          message.reply(
            "Failed to add user. Make sure the number is correct and the user has not restricted being added to groups.",
          )
        }
        break

      case "promote":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to promote.")

        const promoteUser = message.mentions[0]
        await chat.promoteParticipants([promoteUser.id._serialized])
        message.reply(`User ${promoteUser.pushname || "User"} has been promoted to admin.`)
        break

      case "demote":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to demote.")

        const demoteUser = message.mentions[0]
        await chat.demoteParticipants([demoteUser.id._serialized])
        message.reply(`User ${demoteUser.pushname || "User"} has been demoted from admin.`)
        break

      case "welcome":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")

        const welcomeMsg = args.join(" ")
        if (!welcomeMsg) {
          return message.reply(`Current welcome message: ${config.groups[chat.id._serialized].welcome}`)
        }

        config.groups[chat.id._serialized].welcome = welcomeMsg
        saveConfig()
        message.reply("Welcome message has been set.")
        break

      case "goodbye":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")

        const goodbyeMsg = args.join(" ")
        if (!goodbyeMsg) {
          return message.reply(`Current goodbye message: ${config.groups[chat.id._serialized].goodbye}`)
        }

        config.groups[chat.id._serialized].goodbye = goodbyeMsg
        saveConfig()
        message.reply("Goodbye message has been set.")
        break

      case "rules":
        if (!isGroup) return message.reply("This command can only be used in groups.")

        const rules = args.join(" ")
        if (!rules) {
          return message.reply(`*Group Rules:*\n${config.groups[chat.id._serialized].rules}`)
        }

        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can set rules.")

        config.groups[chat.id._serialized].rules = rules
        saveConfig()
        message.reply("Group rules have been set.")
        break

      case "antilink":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")

        if (!args[0]) {
          return message.reply(
            `Anti-link is currently ${config.groups[chat.id._serialized].antiLink ? "enabled" : "disabled"}.`,
          )
        }

        const status = args[0].toLowerCase()
        if (status === "on") {
          config.groups[chat.id._serialized].antiLink = true
          saveConfig()
          message.reply("Anti-link has been enabled.")
        } else if (status === "off") {
          config.groups[chat.id._serialized].antiLink = false
          saveConfig()
          message.reply("Anti-link has been disabled.")
        } else {
          message.reply('Invalid option. Use "on" or "off".')
        }
        break

      // MEDIA COMMANDS
      case "sticker":
        if (message.hasMedia) {
          const media = await message.downloadMedia()
          message.reply(media, message.from, { sendMediaAsSticker: true })
        } else if (message.hasQuotedMsg) {
          const quotedMsg = await message.getQuotedMessage()
          if (quotedMsg.hasMedia) {
            const media = await quotedMsg.downloadMedia()
            message.reply(media, message.from, { sendMediaAsSticker: true })
          } else {
            message.reply("The quoted message does not contain media.")
          }
        } else {
          message.reply("Please send an image or video, or quote a message with media.")
        }
        break

      case "savestatus":
        if (message.hasQuotedMsg) {
          const quotedMsg = await message.getQuotedMessage()
          if (quotedMsg.isStatus && quotedMsg.hasMedia) {
            const media = await quotedMsg.downloadMedia()
            const fileName = `status_${Date.now()}.${media.mimetype.split("/")[1]}`
            fs.writeFileSync(path.join(STATUS_DIR, fileName), Buffer.from(media.data, "base64"))
            message.reply(`Status saved as ${fileName}`)
          } else {
            message.reply("The quoted message is not a status or does not contain media.")
          }
        } else {
          message.reply("Please quote a status message to save it.")
        }
        break

      case "image":
        if (args.length === 0) return message.reply("Please provide a search query.")
        try {
          const query = args.join(" ")
          const response = await axios.get(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&client_id=your_unsplash_api_key`,
          )
          if (response.data.results.length === 0) return message.reply("No images found.")

          const randomImage = response.data.results[Math.floor(Math.random() * response.data.results.length)]
          const media = await MessageMedia.fromUrl(randomImage.urls.regular)
          message.reply(media, message.from, { caption: randomImage.alt_description || query })
        } catch (err) {
          message.reply("Failed to fetch image. Please try again later.")
        }
        break

      case "video":
        message.reply("This feature is coming soon!")
        break

      case "ytmp3":
        message.reply("This feature is coming soon!")
        break

      case "ytmp4":
        message.reply("This feature is coming soon!")
        break

      // UTILITY COMMANDS
      case "ping":
        const start = Date.now()
        await message.reply("Pinging...")
        const end = Date.now()
        message.reply(`Pong! Latency: ${end - start}ms`)
        break

      case "info":
        const uptime = moment.duration(client.info.uptime, "seconds").humanize()
        const infoText = `*Bot Information*
        
*Name:* WhatsApp Bot
*Version:* 1.0.0
*Uptime:* ${uptime}
*Prefix:* ${config.settings.prefix}
*Groups:* ${Object.keys(config.groups).length}
*Users:* ${Object.keys(config.users).length}
*Commands:* 40+
*Developer:* Your Name
`
        message.reply(infoText)
        break

      case "afk":
        const reason = args.join(" ") || "No reason specified"
        config.users[sender.id.user].afk = true
        config.users[sender.id.user].afkReason = reason
        saveConfig()
        message.reply(`You are now AFK: ${reason}`)
        break

      case "profile":
        const user = config.users[sender.id.user]
        const profileText = `*User Profile*
        
*Name:* ${sender.pushname || "Unknown"}
*Number:* ${sender.id.user}
*Warnings:* ${user.warns}
*Banned:* ${user.banned ? "Yes" : "No"}
*Last Seen:* ${moment(user.lastSeen).fromNow()}
*AFK:* ${user.afk ? "Yes" : "No"}
${user.afk ? `*AFK Reason:* ${user.afkReason}` : ""}
`
        message.reply(profileText)
        break

      case "weather":
        if (args.length === 0) return message.reply("Please provide a location.")
        try {
          const location = args.join(" ")
          const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=your_openweather_api_key`,
          )

          const weather = response.data
          const weatherText = `*Weather for ${weather.name}, ${weather.sys.country}*
          
*Temperature:* ${weather.main.temp}°C
*Feels Like:* ${weather.main.feels_like}°C
*Min/Max:* ${weather.main.temp_min}°C / ${weather.main.temp_max}°C
*Humidity:* ${weather.main.humidity}%
*Weather:* ${weather.weather[0].main} - ${weather.weather[0].description}
*Wind:* ${weather.wind.speed} m/s, ${weather.wind.deg}°
*Pressure:* ${weather.main.pressure} hPa
*Visibility:* ${weather.visibility / 1000} km
`
          message.reply(weatherText)
        } catch (err) {
          message.reply("Failed to fetch weather information. Please check the location and try again.")
        }
        break

      case "translate":
        if (args.length < 2) return message.reply("Please provide a language code and text to translate.")
        try {
          const lang = args[0]
          const text = args.slice(1).join(" ")

          // Note: You would need to implement a translation API here
          message.reply(`Translation feature is coming soon!`)
        } catch (err) {
          message.reply("Failed to translate text. Please try again later.")
        }
        break

      case "calculate":
        if (args.length === 0) return message.reply("Please provide an expression to calculate.")
        try {
          const expression = args.join(" ")
          // Simple evaluation - be careful with this in production!
          // For security, use a math expression parser library instead
          const result = eval(expression)
          message.reply(`*Expression:* ${expression}\n*Result:* ${result}`)
        } catch (err) {
          message.reply("Invalid expression. Please try again.")
        }
        break

      case "shorturl":
        if (args.length === 0) return message.reply("Please provide a URL to shorten.")
        try {
          const url = args[0]
          // Note: You would need to implement a URL shortener API here
          message.reply(`URL shortening feature is coming soon!`)
        } catch (err) {
          message.reply("Failed to shorten URL. Please try again later.")
        }
        break

      case "covid":
        if (args.length === 0) return message.reply("Please provide a country name.")
        try {
          const country = args.join(" ")
          const response = await axios.get(`https://disease.sh/v3/covid-19/countries/${encodeURIComponent(country)}`)

          const data = response.data
          const covidText = `*COVID-19 Stats for ${data.country}*
          
*Cases:* ${data.cases.toLocaleString()}
*Today's Cases:* ${data.todayCases.toLocaleString()}
*Deaths:* ${data.deaths.toLocaleString()}
*Today's Deaths:* ${data.todayDeaths.toLocaleString()}
*Recovered:* ${data.recovered.toLocaleString()}
*Active:* ${data.active.toLocaleString()}
*Critical:* ${data.critical.toLocaleString()}
*Cases Per Million:* ${data.casesPerOneMillion.toLocaleString()}
*Deaths Per Million:* ${data.deathsPerOneMillion.toLocaleString()}
*Tests:* ${data.tests.toLocaleString()}
*Tests Per Million:* ${data.testsPerOneMillion.toLocaleString()}
`
          message.reply(covidText)
        } catch (err) {
          message.reply("Failed to fetch COVID-19 data. Please check the country name and try again.")
        }
        break

      case "news":
        try {
          const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&apiKey=your_newsapi_key`)

          if (response.data.articles.length === 0) return message.reply("No news found.")

          let newsText = "*Latest News Headlines*\n\n"
          const articles = response.data.articles.slice(0, 5)

          for (let i = 0; i < articles.length; i++) {
            const article = articles[i]
            newsText += `*${i + 1}. ${article.title}*\n`
            newsText += `${article.description || "No description available."}\n`
            newsText += `Source: ${article.source.name}\n\n`
          }

          message.reply(newsText)
        } catch (err) {
          message.reply("Failed to fetch news. Please try again later.")
        }
        break

      case "dictionary":
        if (args.length === 0) return message.reply("Please provide a word to look up.")
        try {
          const word = args[0]
          const response = await axios.get(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
          )

          if (!response.data || response.data.length === 0) return message.reply("No definitions found.")

          const entry = response.data[0]
          let definitionText = `*Definitions for "${entry.word}"*\n\n`

          for (let i = 0; i < Math.min(entry.meanings.length, 3); i++) {
            const meaning = entry.meanings[i]
            definitionText += `*Part of Speech:* ${meaning.partOfSpeech}\n`

            for (let j = 0; j < Math.min(meaning.definitions.length, 2); j++) {
              const definition = meaning.definitions[j]
              definitionText += `*Definition ${j + 1}:* ${definition.definition}\n`
              if (definition.example) definitionText += `*Example:* ${definition.example}\n`
            }

            if (meaning.synonyms && meaning.synonyms.length > 0) {
              definitionText += `*Synonyms:* ${meaning.synonyms.slice(0, 5).join(", ")}\n`
            }

            definitionText += "\n"
          }

          message.reply(definitionText)
        } catch (err) {
          message.reply("Failed to fetch definition. Please check the word and try again.")
        }
        break

      case "reminder":
        if (args.length < 2) return message.reply("Please provide a time and message for the reminder.")
        try {
          const timeArg = args[0]
          const reminderMsg = args.slice(1).join(" ")

          // Parse time (simple implementation)
          let timeMs
          if (timeArg.endsWith("s")) {
            timeMs = Number.parseInt(timeArg) * 1000
          } else if (timeArg.endsWith("m")) {
            timeMs = Number.parseInt(timeArg) * 60 * 1000
          } else if (timeArg.endsWith("h")) {
            timeMs = Number.parseInt(timeArg) * 60 * 60 * 1000
          } else {
            return message.reply("Invalid time format. Use 10s, 5m, 2h etc.")
          }

          if (isNaN(timeMs) || timeMs <= 0) {
            return message.reply("Invalid time value.")
          }

          message.reply(`Reminder set for ${timeArg} from now.`)

          setTimeout(async () => {
            await message.reply(`*REMINDER:* ${reminderMsg}`)
          }, timeMs)
        } catch (err) {
          message.reply("Failed to set reminder. Please try again.")
        }
        break

      // ADMIN COMMANDS
      case "ban":
        if (!isAdmin) return message.reply("Only bot admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to ban.")

        const banUser = message.mentions[0]
        config.users[banUser.id.user].banned = true
        saveConfig()
        message.reply(`User ${banUser.pushname || "User"} has been banned from using the bot.`)
        break

      case "unban":
        if (!isAdmin) return message.reply("Only bot admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to unban.")

        const unbanUser = message.mentions[0]
        config.users[unbanUser.id.user].banned = false
        saveConfig()
        message.reply(`User ${unbanUser.pushname || "User"} has been unbanned.`)
        break

      case "warn":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to warn.")

        const warnUser = message.mentions[0]
        if (!config.users[warnUser.id.user]) {
          config.users[warnUser.id.user] = {
            warns: 0,
            banned: false,
            afk: false,
            afkReason: "",
            lastSeen: Date.now(),
          }
        }

        config.users[warnUser.id.user].warns++
        saveConfig()

        const warnCount = config.users[warnUser.id.user].warns
        message.reply(`User ${warnUser.pushname || "User"} has been warned. Total warnings: ${warnCount}`)

        if (warnCount >= 3) {
          await chat.removeParticipants([warnUser.id._serialized])
          message.reply(`User ${warnUser.pushname || "User"} has been kicked for reaching 3 warnings.`)
        }
        break

      case "unwarn":
        if (!isGroup) return message.reply("This command can only be used in groups.")
        if (!isGroupAdmin && !isAdmin) return message.reply("Only admins can use this command.")
        if (!message.mentions || message.mentions.length === 0)
          return message.reply("Please mention the user you want to unwarn.")

        const unwarnUser = message.mentions[0]
        if (!config.users[unwarnUser.id.user] || config.users[unwarnUser.id.user].warns === 0) {
          return message.reply(`User ${unwarnUser.pushname || "User"} has no warnings.`)
        }

        config.users[unwarnUser.id.user].warns--
        saveConfig()

        message.reply(
          `A warning has been removed from ${unwarnUser.pushname || "User"}. Total warnings: ${config.users[unwarnUser.id.user].warns}`,
        )
        break

      case "setprefix":
        if (!isAdmin) return message.reply("Only bot admins can use this command.")
        if (!args[0]) return message.reply(`Current prefix is: ${config.settings.prefix}`)

        config.settings.prefix = args[0]
        saveConfig()
        message.reply(`Prefix has been changed to: ${args[0]}`)
        break

      case "broadcast":
        if (!isAdmin) return message.reply("Only bot admins can use this command.")
        if (args.length === 0) return message.reply("Please provide a message to broadcast.")

        const broadcastMsg = args.join(" ")
        let successCount = 0

        for (const groupId of Object.keys(config.groups)) {
          try {
            const group = await client.getChatById(groupId)
            await group.sendMessage(`*Broadcast Message*\n\n${broadcastMsg}`)
            successCount++
          } catch (err) {
            console.error(`Failed to send broadcast to ${groupId}:`, err)
          }
        }

        message.reply(`Broadcast sent to ${successCount} groups.`)
        break

      case "restart":
        if (!isAdmin) return message.reply("Only bot admins can use this command.")
        message.reply("Restarting bot...")
        process.exit(0) // Process will be restarted by process manager
        break

      // FUN COMMANDS
      case "joke":
        try {
          const response = await axios.get("https://official-joke-api.appspot.com/random_joke")
          const joke = response.data
          message.reply(`*Joke*\n\n${joke.setup}\n\n${joke.punchline}`)
        } catch (err) {
          message.reply("Failed to fetch a joke. Please try again later.")
        }
        break

      case "meme":
        try {
          const response = await axios.get("https://meme-api.com/gimme")
          const meme = response.data
          const media = await MessageMedia.fromUrl(meme.url)
          message.reply(media, message.from, { caption: meme.title })
        } catch (err) {
          message.reply("Failed to fetch a meme. Please try again later.")
        }
        break

      case "quote":
        try {
          const response = await axios.get("https://api.quotable.io/random")
          const quote = response.data
          message.reply(`*"${quote.content}"*\n\n- ${quote.author}`)
        } catch (err) {
          message.reply("Failed to fetch a quote. Please try again later.")
        }
        break

      case "fact":
        try {
          const response = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en")
          const fact = response.data
          message.reply(`*Random Fact*\n\n${fact.text}`)
        } catch (err) {
          message.reply("Failed to fetch a fact. Please try again later.")
        }
        break

      case "8ball":
        if (args.length === 0) return message.reply("Please ask a question.")

        const responses = [
          "It is certain.",
          "It is decidedly so.",
          "Without a doubt.",
          "Yes, definitely.",
          "You may rely on it.",
          "As I see it, yes.",
          "Most likely.",
          "Outlook good.",
          "Yes.",
          "Signs point to yes.",
          "Reply hazy, try again.",
          "Ask again later.",
          "Better not tell you now.",
          "Cannot predict now.",
          "Concentrate and ask again.",
          "Don't count on it.",
          "My reply is no.",
          "My sources say no.",
          "Outlook not so good.",
          "Very doubtful.",
        ]

        const randomResponse = responses[Math.floor(Math.random() * responses.length)]
        message.reply(`*Magic 8-Ball*\n\nQuestion: ${args.join(" ")}\n\nAnswer: ${randomResponse}`)
        break

      case "flip":
        const coin = Math.random() < 0.5 ? "Heads" : "Tails"
        message.reply(`*Coin Flip*\n\nResult: ${coin}`)
        break

      case "roll":
        const dice = Math.floor(Math.random() * 6) + 1
        message.reply(`*Dice Roll*\n\nResult: ${dice}`)
        break

      case "tts":
        message.reply("Text-to-speech feature is coming soon!")
        break

      // Default case for unknown commands
      default:
        message.reply(`Unknown command: ${command}. Use ${prefix}help to see available commands.`)
        break
    }
  } catch (err) {
    console.error("Error handling message:", err)
    message.reply("An error occurred while processing your command.")
  }
})

// Group participant events
client.on("group_join", async (notification) => {
  try {
    const group = await notification.getChat()
    if (!config.groups[group.id._serialized]) return
    if (config.groups[group.id._serialized].muted) return

    const user = await notification.getContact()
    let welcomeMsg = config.groups[group.id._serialized].welcome
    welcomeMsg = welcomeMsg.replace("@user", `@${user.id.user}`)

    await group.sendMessage(welcomeMsg, { mentions: [user] })
  } catch (err) {
    console.error("Error handling group join:", err)
  }
})

client.on("group_leave", async (notification) => {
  try {
    const group = await notification.getChat()
    if (!config.groups[group.id._serialized]) return
    if (config.groups[group.id._serialized].muted) return

    const user = await notification.getContact()
    let goodbyeMsg = config.groups[group.id._serialized].goodbye
    goodbyeMsg = goodbyeMsg.replace("@user", `@${user.id.user}`)

    await group.sendMessage(goodbyeMsg)
  } catch (err) {
    console.error("Error handling group leave:", err)
  }
})

// Anti-link functionality
client.on("message", async (message) => {
  try {
    if (!message.body.startsWith(config.settings.prefix)) {
      const chat = await message.getChat()
      if (chat.isGroup && config.groups[chat.id._serialized]?.antiLink) {
        const sender = await message.getContact()
        const isGroupAdmin = chat.participants.find((p) => p.id._serialized === sender.id._serialized)?.isAdmin
        const isAdmin = config.settings.adminNumbers.includes(sender.id.user)

        if (!isGroupAdmin && !isAdmin) {
          // Check for links
          const linkRegex = /(https?:\/\/|www\.)\S+/gi
          if (linkRegex.test(message.body)) {
            await message.reply("Links are not allowed in this group.")
            await chat.removeParticipants([sender.id._serialized])
            await chat.sendMessage(`@${sender.id.user} has been removed for sending links.`, { mentions: [sender] })
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in anti-link:", err)
  }
})

// AFK mention notification
client.on("message", async (message) => {
  try {
    if (message.mentions && message.mentions.length > 0) {
      for (const mentionedContact of message.mentions) {
        const mentionedUser = config.users[mentionedContact.id.user]
        if (mentionedUser && mentionedUser.afk) {
          message.reply(`@${mentionedContact.id.user} is currently AFK: ${mentionedUser.afkReason}`)
        }
      }
    }
  } catch (err) {
    console.error("Error in AFK mention:", err)
  }
})

// Initialize the client
client.initialize()

// Handle process termination
process.on("SIGINT", () => {
  console.log("Shutting down...")
  client.destroy()
  process.exit(0)
})

// For Render deployment - create a simple HTTP server
const http = require("http")
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" })
  res.end("WhatsApp Bot is running!")
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})

