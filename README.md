# Louvor PIBU

## Mixer de vozes

- A leitura de vozes e fragmentos usa a API HTTP do Firestore, com alternativa pelo SDK. Erros de conexão não são apresentados como ausência de áudios.
- Uma música sem vozes na memória é consultada novamente ao abrir o modal. Falhas oferecem “Tentar novamente”.
- Os arquivos de áudio são carregados com duas transferências simultâneas para reduzir o pico de memória em celulares.
- Em navegadores que adiam os metadados até o toque do usuário, o botão Reproduzir continua disponível quando o arquivo já foi obtido.

- O motor usa um único AudioContext e decodifica todas as pistas antes de iniciar. Todos os AudioBufferSourceNodes começam no mesmo instante do relógio de áudio, sem correções periódicas de posição.
- O primeiro toque desbloqueia a saída de áudio antes de qualquer operação assíncrona, inclusive em iOS.
- As faixas usam uma única linha do tempo, com reprodução, pausa e retorno ao início em conjunto.
- Cada faixa oferece Solo (S), Mute (M) e volume independente. Várias faixas podem ficar em solo ao mesmo tempo; Mute tem prioridade.
- Faixas silenciadas continuam acompanhando a posição da música, para voltarem no instante correto.
- Há volume geral e transposição conjunta de -6 a +6 semitons, sem mudar a velocidade.
- O filtro “Exibir” muda apenas as faixas visíveis; Solo e Mute controlam a mixagem.
- “Reiniciar saída de áudio” recria o contexto, preservando os buffers, posição, volumes, solo e mute. Permite recuperar a saída sem recarregar os arquivos.
- Fechar o modal interrompe a reprodução. Editar uma identificação preserva a posição e os volumes, pausando o conjunto.
- `voice-mixer.js` concentra o controle de reprodução; `voice-mixer.css` define o layout responsivo.
- `npm test` inclui testes de sincronização, busca, volume, solo/mute, decodificação, interrupções do dispositivo e encerramento durante reprodução pendente.

Aplicativo estático do ministério de louvor, publicado no Netlify e conectado ao Firebase.

## Persistência

- Dados textuais existentes continuam sendo lidos da coleção legada `store`.
- Novas vozes recebem metadados em `songVoices` e o arquivo é dividido na subcoleção `chunks`.
- Novos materiais seguem o mesmo modelo em `songMaterials`.
- Cada bloco tem no máximo 600 mil caracteres e cada arquivo tem limite de 10 MB.
- Essa estrutura permanece no plano gratuito Spark e não depende do Firebase Storage.
- A interface só informa sucesso depois que o Firestore confirma a gravação pelo servidor.
- A aplicação não executa mais migrações ou importações automaticamente durante uma visita.

## Acesso de liderança

O modo Líder usa Firebase Authentication com e-mail e senha. As regras versionadas permitem leitura pública e escrita apenas para usuários autenticados. Contas devem ser criadas pelo Firebase Console; credenciais nunca devem ser adicionadas ao repositório.

## Transpositor de áudio

- O projeto inteiro da área Vozes pode ser transposto de -6 a +6 semitons em tempo real, sem alterar a velocidade e sem gravar uma nova cópia no Firebase.
- A lista pode ser filtrada por Melodia, Tenor, Contralto ou Soprano.
- Líderes podem editar o nome e o tipo de uma gravação. Nos áudios legados, a edição é guardada em um pequeno documento de metadados para não regravar o arquivo Base64 próximo do limite do Firestore.
- A transposição usa um único processador depois da soma das pistas. O processamento usa a Web Audio API no aparelho do visitante. A implementação inclui localmente o SoundTouchJS 2.1.1 sob a licença MPL-2.0, preservada em `vendor/soundtouch/LICENSE`.

## Materiais de apoio

- Áudio e PDF aceitam arquivos de até 10 MB.
- Texto é salvo diretamente no Firestore.
- Vídeo e Outro aceitam somente links HTTP/HTTPS; a interface e as regras não permitem documentos fragmentados desses tipos.
- O arquivo é validado por tipo e extensão antes do envio. O documento do material é criado antes dos blocos para que as regras confirmem que somente Áudio ou PDF podem possuir chunks.

## Validação local

```sh
npm test
```

O teste de navegador `tests/audio-render.html` renderiza três pistas com OfflineAudioContext e compara amostras PCM da soma, do solo e do mute. Ele verifica o áudio resultante, além do agendamento simultâneo, e percorre 340 segundos em 44,1 e 48 kHz, incluindo 3:39.

O AudioContext usa a frequência nativa do dispositivo e `latencyHint: playback`, evitando impor 44,1 kHz e latência mínima. A decodificação acompanha essa frequência; projetos longos podem exigir bastante memória. Fechar o modal libera os buffers e o contexto de áudio.

## Publicação

- Branch de produção recomendada: `main`.
- Diretório publicado pelo Netlify: raiz do repositório.
- Regras do Firebase devem ser revisadas e implantadas antes do novo frontend.
- Nunca publicar primeiro o frontend que exige autenticação sem que Authentication, Firestore Rules e Storage Rules estejam prontos.
