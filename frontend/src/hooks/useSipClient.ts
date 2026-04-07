import { useEffect, useRef, useState, useCallback } from 'react';
import {
  UserAgent,
  Registerer,
  RegistererState,
  Inviter,
  Invitation,
  SessionState,
  UserAgentOptions,
} from 'sip.js';

export type SipStatus = 'idle' | 'connecting' | 'registered' | 'unregistered' | 'error';
export type CallState = 'idle' | 'ringing_in' | 'ringing_out' | 'in_call';

export interface SipClientOptions {
  extensionNumber: string;
  password: string;
  wsServer: string;
  displayName?: string;
}

export interface SipClient {
  sipStatus: SipStatus;
  callState: CallState;
  remoteIdentity: string;
  isMuted: boolean;
  isOnHold: boolean;
  answer: () => void;
  hangup: () => void;
  makeCall: (target: string) => void;
  toggleMute: () => void;
  toggleHold: () => void;
  transfer: (target: string) => void;
}

export function useSipClient(options: SipClientOptions | null): SipClient {
  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Invitation | Inviter | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [sipStatus, setSipStatus] = useState<SipStatus>('idle');
  const [callState, setCallState] = useState<CallState>('idle');
  const [remoteIdentity, setRemoteIdentity] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

  // Cria elemento de áudio oculto para reproduzir o áudio remoto
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;
    return () => {
      audio.srcObject = null;
    };
  }, []);

  const attachRemoteAudio = useCallback((session: Invitation | Inviter) => {
    const sdh = (session as any).sessionDescriptionHandler;
    if (!sdh?.remoteMediaStream || !audioRef.current) return;
    audioRef.current.srcObject = sdh.remoteMediaStream;
    audioRef.current.play().catch(() => {});
  }, []);

  const cleanupSession = useCallback(() => {
    sessionRef.current = null;
    setCallState('idle');
    setRemoteIdentity('');
    setIsMuted(false);
    setIsOnHold(false);
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }, []);

  const wireSessionEvents = useCallback(
    (session: Invitation | Inviter) => {
      session.stateChange.addListener((state: SessionState) => {
        switch (state) {
          case SessionState.Establishing:
            setCallState((prev) => (prev === 'ringing_in' ? 'ringing_in' : 'ringing_out'));
            break;
          case SessionState.Established:
            setCallState('in_call');
            attachRemoteAudio(session);
            break;
          case SessionState.Terminated:
            cleanupSession();
            break;
        }
      });
    },
    [attachRemoteAudio, cleanupSession],
  );

  // Inicializa / destrói o UserAgent quando as credenciais mudam
  useEffect(() => {
    if (!options) {
      setSipStatus('idle');
      return;
    }

    const { extensionNumber, password, wsServer, displayName } = options;

    const uaOptions: UserAgentOptions = {
      uri: UserAgent.makeURI(`sip:${extensionNumber}@asterisk`),
      transportOptions: { server: wsServer },
      authorizationUsername: extensionNumber,
      authorizationPassword: password,
      displayName: displayName || extensionNumber,
      logLevel: 'error',
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: {
          iceServers: [],
        },
      },
    };

    const ua = new UserAgent(uaOptions);
    uaRef.current = ua;

    // Chamadas recebidas
    ua.delegate = {
      onInvite: (invitation: Invitation) => {
        sessionRef.current = invitation;
        const callerUri = invitation.remoteIdentity?.uri?.user || 'desconhecido';
        setRemoteIdentity(
          invitation.remoteIdentity?.displayName || callerUri,
        );
        setCallState('ringing_in');
        wireSessionEvents(invitation);
      },
    };

    setSipStatus('connecting');

    ua.start()
      .then(() => {
        const registerer = new Registerer(ua);
        registererRef.current = registerer;

        registerer.stateChange.addListener((state: RegistererState) => {
          if (state === RegistererState.Registered) setSipStatus('registered');
          else if (state === RegistererState.Unregistered) setSipStatus('unregistered');
        });

        return registerer.register();
      })
      .catch(() => setSipStatus('error'));

    return () => {
      registererRef.current?.unregister().catch(() => {});
      ua.stop().catch(() => {});
      uaRef.current = null;
      registererRef.current = null;
      cleanupSession();
      setSipStatus('idle');
    };
  }, [options?.extensionNumber, options?.password, options?.wsServer]);

  const answer = useCallback(() => {
    const session = sessionRef.current as Invitation | null;
    if (!session || callState !== 'ringing_in') return;
    session.accept().catch(console.error);
  }, [callState]);

  const hangup = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    if (session instanceof Invitation) {
      if (callState === 'ringing_in') {
        session.reject().catch(console.error);
      } else {
        session.bye().catch(console.error);
      }
    } else if (session instanceof Inviter) {
      if (callState === 'ringing_out') {
        session.cancel().catch(console.error);
      } else {
        session.bye().catch(console.error);
      }
    }
  }, [callState]);

  const makeCall = useCallback(
    (target: string) => {
      const ua = uaRef.current;
      if (!ua || sipStatus !== 'registered') return;

      // Normaliza o target: se for só números, monta URI SIP
      const uri =
        target.startsWith('sip:')
          ? UserAgent.makeURI(target)
          : UserAgent.makeURI(`sip:${target}@asterisk`);

      if (!uri) return;

      const inviter = new Inviter(ua, uri);
      sessionRef.current = inviter;
      setCallState('ringing_out');
      wireSessionEvents(inviter);
      inviter.invite().catch(console.error);
    },
    [sipStatus, wireSessionEvents],
  );

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const sdh = (session as any).sessionDescriptionHandler;
    if (!sdh?.peerConnection) return;

    const newMuted = !isMuted;
    sdh.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
      if (sender.track) sender.track.enabled = !newMuted;
    });
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleHold = useCallback(() => {
    const session = sessionRef.current;
    if (!session || callState !== 'in_call') return;

    const newHold = !isOnHold;
    (session as any)
      .invite({ sessionDescriptionHandlerOptions: { hold: newHold } })
      .catch(console.error);
    setIsOnHold(newHold);
  }, [callState, isOnHold]);

  const transfer = useCallback(
    (target: string) => {
      const session = sessionRef.current;
      const ua = uaRef.current;
      if (!session || !ua || callState !== 'in_call') return;

      const uri =
        target.startsWith('sip:')
          ? UserAgent.makeURI(target)
          : UserAgent.makeURI(`sip:${target}@asterisk`);

      if (!uri) return;
      (session as any).refer(uri).catch(console.error);
    },
    [callState],
  );

  return {
    sipStatus,
    callState,
    remoteIdentity,
    isMuted,
    isOnHold,
    answer,
    hangup,
    makeCall,
    toggleMute,
    toggleHold,
    transfer,
  };
}
