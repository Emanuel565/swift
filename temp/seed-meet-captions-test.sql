INSERT INTO meet_caption_transcription (
  id, session_id, meeting_id, user_id,
  meeting_title, owner_name, owner_email,
  started_at, ended_at, first_segment_at, last_segment_at,
  duration_seconds, participant_count, participant_names, logged_participants,
  segment_count, raw_size_bytes, compressed_size_bytes,
  compression_codec, compression_ratio,
  transcript_compressed, transcript_preview,
  created_at, updated_at
) VALUES
(
  'a1111111-1111-1111-1111-111111111111',
  'sess-test-001', 'sfu-ibhk-ecs',
  '26a1d97a-c358-46f7-819e-d11ce6ead378',
  'Sprint Planning - Sprint 42', 'João da Silva', 'manuca53813@gmail.com',
  NOW() - interval '2 hours', NOW() - interval '1 hour',
  NOW() - interval '2 hours', NOW() - interval '1 hour 5 minutes',
  3300, 4,
  '["João da Silva", "Maria Oliveira", "Carlos Santos", "Ana Ferreira"]'::jsonb,
  '[{"id": "26a1d97a-c358-46f7-819e-d11ce6ead378", "name": "João da Silva", "email": "manuca53813@gmail.com"}]'::jsonb,
  87, 14200, 3800,
  'brotli-q11', 0.2676,
  E''::bytea,
  E'João da Silva: Bom dia pessoal, vamos começar a planning da sprint 42. Maria, pode apresentar os itens do backlog?\nMaria Oliveira: Claro! Temos 3 histórias prioritárias. A primeira é a implementação do módulo de legendas do Meet.\nCarlos Santos: Ótimo, eu posso pegar essa tarefa. Já estou familiarizado com a API de captions.\nAna Ferreira: Eu fico com a parte de testes e documentação.\nJoão da Silva: Perfeito. Vamos estimar? Maria, qual sua estimativa?\nMaria Oliveira: Eu diria 8 pontos para o módulo completo.\nCarlos Santos: Concordo, 8 pontos parece justo.',
  NOW() - interval '1 hour', NOW() - interval '1 hour'
),
(
  'b2222222-2222-2222-2222-222222222222',
  'sess-test-002', 'abc-defg-hij',
  '26a1d97a-c358-46f7-819e-d11ce6ead378',
  'Daily Standup - Equipe Backend', 'João da Silva', 'manuca53813@gmail.com',
  NOW() - interval '5 hours', NOW() - interval '4 hours 45 minutes',
  NOW() - interval '5 hours', NOW() - interval '4 hours 46 minutes',
  900, 3,
  '["João da Silva", "Pedro Lima", "Juliana Costa"]'::jsonb,
  '[{"id": "26a1d97a-c358-46f7-819e-d11ce6ead378", "name": "João da Silva", "email": "manuca53813@gmail.com"}]'::jsonb,
  32, 5100, 1400,
  'brotli-q11', 0.2745,
  E''::bytea,
  E'João da Silva: Bom dia! Vamos começar a daily. Pedro, pode começar?\nPedro Lima: Ontem finalizei a integração com o Redis para cache de sessões. Hoje vou trabalhar na compressão dos transcripts.\nJuliana Costa: Eu terminei os testes do módulo de autenticação. Hoje começo a revisão de código.\nJoão da Silva: Ótimo andamento. Algum bloqueio?\nPedro Lima: Nenhum por enquanto.\nJuliana Costa: Tudo certo aqui também.',
  NOW() - interval '4 hours 45 minutes', NOW() - interval '4 hours 45 minutes'
),
(
  'c3333333-3333-3333-3333-333333333333',
  'sess-test-003', 'xyz-mnop-qrs',
  '26a1d97a-c358-46f7-819e-d11ce6ead378',
  'Reunião com Cliente - Projeto Alpha', 'Maria Oliveira', 'maria@empresa.com',
  NOW() - interval '1 day', NOW() - interval '23 hours',
  NOW() - interval '1 day', NOW() - interval '23 hours 2 minutes',
  3600, 5,
  '["João da Silva", "Maria Oliveira", "Cliente Roberto", "Cliente Fernanda", "Carlos Santos"]'::jsonb,
  '[{"id": "26a1d97a-c358-46f7-819e-d11ce6ead378", "name": "João da Silva", "email": "manuca53813@gmail.com"}]'::jsonb,
  156, 28500, 7200,
  'brotli-q11', 0.2526,
  E''::bytea,
  E'Maria Oliveira: Boa tarde a todos! Obrigada por participarem. Vamos discutir o andamento do Projeto Alpha.\nCliente Roberto: Boa tarde! Gostaríamos de entender o status da entrega do módulo de relatórios.\nJoão da Silva: Claro, Roberto. Estamos com 80% concluído. A previsão é entregar na próxima semana.\nCliente Fernanda: E quanto à integração com nosso ERP?\nCarlos Santos: Já mapeamos todos os endpoints. A integração está em fase de testes.\nMaria Oliveira: Excelente. Vou compartilhar o cronograma atualizado com vocês até sexta.',
  NOW() - interval '23 hours', NOW() - interval '23 hours'
)
ON CONFLICT (session_id) DO NOTHING;
