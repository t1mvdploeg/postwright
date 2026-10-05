// Zet zod's standaardmeldingen op Nederlands. De meldingen van valideerParameters en
// TariefInvoerSchema komen letterlijk op de beheerpagina/foutmelding bij de gebruiker terecht,
// dus die moeten Nederlands zijn (global constraints), niet zod's Engelse standaardteksten.
import { z } from "zod";

z.config(z.locales.nl());
