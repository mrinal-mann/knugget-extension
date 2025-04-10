declare namespace KnuggetAI {
    interface UserInfo {
      id: string;
      name: string;
      email: string;
      token: string;
      expiresAt: number;
    }
    
    interface Summary {
      id: string;
      title: string;
      content: string;
      sourceUrl: string;
      createdAt: string;
    }
    
    interface Message {
      type: string;
      payload?: any;
    }
    
    interface TranscriptSegment {
      text: string;
      start: number;
      duration: number;
    }
    
    interface VideoMetadata {
      videoId: string;
      title: string;
      channelName: string;
      publishDate: string;
      duration: number;
    }
  }