import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Headphones, ExternalLink, Mic, Shield, ArrowLeft } from 'lucide-react';

export default function GhostExtensao() {
  return (
    <div className="min-h-screen bg-[#0b0f14] text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-emerald-400 mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Voltar ao início
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/30">
              <Headphones className="text-violet-400" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Extensão Ghost Transcrição</h1>
              <p className="text-zinc-500 text-sm">Chrome · modo teste sem login</p>
            </div>
          </div>

          <div className="space-y-6 text-zinc-300 text-sm leading-relaxed">
            <section className="rounded-2xl border border-zinc-800 bg-[#0e1319] p-6">
              <h2 className="text-white font-medium mb-3 flex items-center gap-2">
                <Mic size={18} className="text-emerald-400" /> Instalação
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-zinc-400">
                <li>Abra o Chrome e vá em <code className="text-emerald-400/90 bg-zinc-900 px-1 rounded">chrome://extensions</code></li>
                <li>Ative o <strong className="text-zinc-200">Modo do desenvolvedor</strong> (canto superior direito)</li>
                <li>Clique em <strong className="text-zinc-200">Carregar sem compactação</strong></li>
                <li>
                  Selecione a pasta <code className="text-violet-300 bg-zinc-900 px-1 rounded">extension</code> dentro do
                  projeto Radiante no seu disco
                </li>
              </ol>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-[#0e1319] p-6">
              <h2 className="text-white font-medium mb-3">Uso rápido</h2>
              <ul className="space-y-2 text-zinc-400">
                <li>• Inicie o backend Node na porta 3000 (API Radiante).</li>
                <li>• Abra o popup da extensão e deixe <strong className="text-zinc-200">modo teste sem JWT</strong> ativado.</li>
                <li>• WebSocket padrão: <code className="text-emerald-400/90">ws://127.0.0.1:3000/ws/audio</code></li>
                <li>• Ative uma aba com áudio, marque o consentimento e clique em iniciar captura.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-6 flex gap-3">
              <Shield className="text-amber-500 shrink-0 mt-0.5" size={20} />
              <div>
                <h2 className="text-amber-200 font-medium mb-1">Privacidade</h2>
                <p className="text-amber-100/70 text-xs">
                  A gravação captura o áudio da aba selecionada. Use apenas em contextos permitidos e com consentimento das
                  pessoas gravadas.
                </p>
              </div>
            </section>

            <Link
              to="/transcricoes"
              className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-medium"
            >
              Abrir painel de transcrições <ExternalLink size={14} />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
