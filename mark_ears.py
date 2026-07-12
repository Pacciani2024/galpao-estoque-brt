import speech_recognition as sr
import requests
import time
import os
import pygame
from gtts import gTTS
import threading

# Configurações
API_URL = "http://localhost:3000/api/chat"
WAKE_WORDS = ["brt kira", "kira", "brt keira", "bert kira", "keira"]  # Aceita "Kira" sozinha também

def play_audio(filename):
    try:
        if not os.path.exists(filename): 
            return # Ignora se arquivo não existir (ex: beep)
            
        pygame.mixer.init()
        pygame.mixer.music.load(filename)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)
        pygame.mixer.quit()
        # Tentar remover arquivo temporário após uso
        if "response_" in filename: # Só deleta respostas, não beeps
            try:
                os.remove(filename)
            except:
                pass
    except Exception as e:
        print(f"Erro ao reproduzir áudio: {e}")

def text_to_speech(text):
    try:
        # Gerar áudio
        tts = gTTS(text=text, lang='pt')
        filename = f"response_{int(time.time())}.mp3"
        tts.save(filename)
        play_audio(filename)
    except Exception as e:
        print(f"Erro no TTS: {e}")

def send_to_mark(text):
    print(f"📡 Enviando para Mark: {text}")
    try:
        # Enviar flag source='voice_module' para o servidor saber que veio da voz
        # O servidor vai salvar isso e o Frontend vai ler e Falar via Web Speech API
        response = requests.post(API_URL, json={"message": text, "source": "voice_module"})
        
        if response.status_code == 200:
            data = response.json()
            if data.get('error'):
                print(f"❌ Erro do Servidor: {data['error']}")
                return

            ai_response = data.get('response', '')
            print(f"🤖 Kira (Resposta): {ai_response}")
            
            # NOTA: O TTS (Falar a resposta) foi removido daqui.
            # Quem vai falar agora é o navegador (Frontend) que tem voz mais natural.
            
        else:
            print(f"❌ Erro HTTP {response.status_code}")
    except Exception as e:
        print(f"Erro de conexão com servidor: {e}")

def listen_loop():
    recognizer = sr.Recognizer()
    recognizer.energy_threshold = 3000
    recognizer.dynamic_energy_threshold = True

    while True:
        try:
            with sr.Microphone() as source:
                print("\n👂 Ouvindo... (Diga 'BRT Kira'...)")
                
                try:
                    audio = recognizer.listen(source, timeout=5, phrase_time_limit=10)
                    
                    # print("🔄 ...") # Silenciar logs excessivos
                    text = recognizer.recognize_google(audio, language="pt-BR").lower()
                    print(f"🗣️  {text}")

                    # Verificar gatilho
                    activated = False
                    for trigger in WAKE_WORDS:
                        if trigger in text:
                            activated = True
                            break
                    
                    if activated:
                        print(f"🚀 Ativado!")
                        # Enviar a frase completa. O LLM entende melhor com contexto.
                        send_to_mark(text)
                        
                except sr.WaitTimeoutError:
                    pass
                except sr.UnknownValueError:
                    pass 
                except sr.RequestError as e:
                    print(f"Erro SpeechGoogle: {e}")

        except KeyboardInterrupt:
            print("🛑 Encerrando...")
            break
        except Exception as e:
            print(f"Erro loop: {e}")
            time.sleep(1)

if __name__ == "__main__":
    print("🤖 --- MARK EARS (Escuta Ativa) ---")
    print(f"🔌 API: {API_URL}")
    print(f"🗣️ Gatilhos: {', '.join(WAKE_WORDS)}")
    listen_loop()
