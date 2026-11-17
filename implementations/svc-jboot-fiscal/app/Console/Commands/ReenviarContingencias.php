<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Infrastructure\Sefaz\ContingenciaManager;

class ReenviarContingencias extends Command
{
    protected $signature = 'fiscal:reenviar-contingencias';
    protected $description = 'Retransmite documentos fiscais em estado de contingencia para a SEFAZ';

    public function __construct(private ContingenciaManager $manager)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $this->manager->reenviarPendentes();

        return self::SUCCESS;
    }
}
