export interface PublicBotInfo {
  bot_id: string;
  name: string;
  description?: string;
  business_type: string;
}

export interface PublicChannelInfo {
  channel_id: string;
  channel_type: string;
  name: string;
  status: string;
  bot: PublicBotInfo;
}

export interface PublicWebChannel {
  channel_id: string;
  name: string;
  channel_type: string;
}

export interface PublicBotWithChannels {
  bot_id: string;
  name: string;
  description?: string;
  business_type: string;
  web_channels: PublicWebChannel[];
}

export interface PublicUserInfo {
  username: string;
  bots: PublicBotWithChannels[];
}
