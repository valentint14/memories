/**
 * Forma unui token de eveniment din linkul invitatului (FR-004): fie slug lizibil + sufix aleator
 * (`nunta-ana-si-mihai-k7p2x9`, generat în DB la creare), fie tokenul aleator de 22 de caractere
 * al evenimentelor mai vechi. Verificarea reală e în DB; aici doar oprim valorile evident greșite.
 */
export const EVENT_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
