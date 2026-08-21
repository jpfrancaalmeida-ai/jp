# Louvor PIBU

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

Cada gravação da área Vozes pode ser transposta de -6 a +6 semitons em tempo real, sem alterar a velocidade e sem gravar uma nova cópia no Firebase. O processamento usa a Web Audio API no aparelho do visitante. A implementação inclui localmente o SoundTouchJS 2.1.1 sob a licença MPL-2.0, preservada em `vendor/soundtouch/LICENSE`.

## Validação local

```sh
npm test
```

Antes de publicar, validar com Firebase Emulator Suite e confirmar o ciclo de upload, recarregamento e reprodução do arquivo.

## Publicação

- Branch de produção recomendada: `main`.
- Diretório publicado pelo Netlify: raiz do repositório.
- Regras do Firebase devem ser revisadas e implantadas antes do novo frontend.
- Nunca publicar primeiro o frontend que exige autenticação sem que Authentication, Firestore Rules e Storage Rules estejam prontos.
