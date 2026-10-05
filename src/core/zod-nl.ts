// Zet zod's standaardmeldingen op Nederlands. Validatiemeldingen komen letterlijk bij de gebruiker
// terecht, dus die moeten Nederlands zijn en niet zod's Engelse standaardteksten.
import { z } from "zod";

z.config(z.locales.nl());
