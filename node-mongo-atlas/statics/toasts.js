// Inicializa a apresentação de mensagens flash como toasts temporários.
(() => {
    // Elementos necessários para mostrar o toast e ler os dados enviados pelo servidor.
    const stack = document.getElementById('toastStack');
    const flashData = document.getElementById('flashData');

    // Se a página não tiver a infraestrutura necessária, o script termina sem fazer nada.
    if (!stack || !flashData) {
        return;
    }

    let toast = null;

    // Tenta interpretar os dados flash serializados em JSON.
    try {
        toast = JSON.parse(flashData.textContent || 'null');
    } catch {
        toast = null;
    }

    // Só cria toast quando existe uma mensagem válida para apresentar.
    if (!toast || typeof toast.message !== 'string' || toast.message === '') {
        return;
    }

    // Cria o elemento visual com o tipo de mensagem apropriado.
    const element = document.createElement('div');
    element.className = `toast ${toast.type === 'success' ? 'success' : 'error'} is-entering`;
    element.setAttribute('role', 'status');
    element.textContent = toast.message;
    stack.appendChild(element);

    // Remove o estado inicial para disparar a animação de entrada.
    requestAnimationFrame(() => {
        element.classList.remove('is-entering');
    });

    // Agenda a animação de saída e a remoção do elemento após alguns segundos.
    window.setTimeout(() => {
        element.classList.add('is-leaving');

        window.setTimeout(() => {
            element.remove();
        }, 340);
    }, 5000);
})();
